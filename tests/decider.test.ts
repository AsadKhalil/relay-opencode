import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDecisionRequest, capText, decide, firstRequest, lastReply, MAX_CHARS, MAX_FILE_NAMES, MAX_REPLY_CHARS, MAX_TASK_CHARS, TIMEOUT_MS, withoutHome, type DecideInput, type FileFact } from '../src/decider.js';

const judge = { providerID: 'd', id: 'judge', variant: null };
const chat: DecideInput = { kind: 'chat', text: 'fix the login test', agent: 'plan', files: [{ name: 'a.txt', bytes: 2048 }], images: 0, lines: {} };
const READ_ONLY = 'Before this message the chat was on a read-only agent, which explains and plans and cannot change files. ';
const choice = (name: string, value: unknown, confidence: unknown) => ({ type: 'choice', name, choice: value, probabilities: [], confidence });
const reply = (value: unknown, confidence: unknown, ...more: unknown[]) => ({ answers: [choice('mode', value, confidence), ...more], cost: 0, tokens: { input: 418, output: 38 } });

test('with no lines to ask about, the request is one choice question with the three modes', () => {
  const request = buildDecisionRequest(judge, chat);
  assert.deepEqual(request.model, { providerID: 'd', id: 'judge' });
  assert.deepEqual(request.input, [{ type: 'text', text: `The person's message: "fix the login test"\n${READ_ONLY}Attached files: a.txt (2 kB). Attached pictures: 0.` }]);
  assert.deepEqual(request.questions.map(q => [q.type, q.name, q.choices.map(c => c.value)]), [['choice', 'mode', ['plan', 'execute', 'review']]]);
  assert.match(request.questions[0].instructions, /Choose execute only when it clearly asks/);
  const helper = buildDecisionRequest({ ...judge, variant: 'fast' }, { kind: 'helper', text: 'Review the diff', agent: null, files: [], images: 0, lines: {} });
  assert.deepEqual(helper.model, { providerID: 'd', id: 'judge', variant: 'fast' });
  assert.equal(helper.input[0].text, 'A task that a model is handing to a helper: "Review the diff"');
});

test("the decider learns whether the chat's agent can change files, never the agent's name", () => {
  const second = (agent: string | null) => buildDecisionRequest(judge, { ...chat, agent }).input[0].text.split('\n')[1];
  assert.equal(second('plan'), `${READ_ONLY}Attached files: a.txt (2 kB). Attached pictures: 0.`);
  assert.equal(second('build'), 'Before this message the chat was on an agent that can change files. Attached files: a.txt (2 kB). Attached pictures: 0.');
  // "plan" is also one of the answers. Told "The chat is on the agent: plan", a real decider (clef:27b, 16 Nov) was 0.51 sure of execute for
  // "fix the off-by-one bug in average() in src/calc.js", so the unsure rule sent it to Plan; with this wording it was 0.90 sure.
  assert.doesNotMatch(second('plan'), /\bplan\b/);
  for (const agent of ['my-team-agent', 'general', null]) assert.equal(second(agent), 'Attached files: a.txt (2 kB). Attached pictures: 0.', `${agent}: no agent line, and no name`);
});

test('each mode with lines gets its own question: the lines as numbered choices, then none', () => {
  const request = buildDecisionRequest(judge, { ...chat, lines: { plan: ['hard design', 'screens'], review: ['security'] } });
  assert.deepEqual(request.questions.map(q => q.name), ['mode', 'plan_line', 'review_line']);
  assert.deepEqual(request.questions[1].choices, [{ value: '1', description: 'hard design' }, { value: '2', description: 'screens' }, { value: 'none', description: 'None of these fits clearly.' }]);
  assert.deepEqual(request.questions[2].choices.map(c => c.value), ['1', 'none']);
  assert.match(request.questions[1].instructions, /Choose none when no description fits clearly/);
  const many = buildDecisionRequest(judge, { ...chat, lines: { execute: Array.from({ length: 12 }, (_, index) => `line ${index}`) } });
  assert.deepEqual(many.questions[1].choices.map(c => c.value), ['1', '2', '3', '4', '5', '6', '7', '8', 'none'], 'never more than eight lines');
  assert.deepEqual(buildDecisionRequest(judge, { ...chat, lines: { plan: [] } }).questions.map(q => q.name), ['mode'], 'no lines, no question');
});

test('the decider is told the names and sizes of at most ten files, and never a folder', () => {
  const second = (files: FileFact[], images = 0) => buildDecisionRequest(judge, { ...chat, files, images }).input[0].text.split('\n')[1];
  assert.equal(MAX_FILE_NAMES, 10);
  assert.equal(second([]), `${READ_ONLY}Attached files: none. Attached pictures: 0.`);
  assert.equal(second([{ name: 'a.txt', bytes: 999 }, { name: 'notes.md', bytes: null }, { name: 'big.log', bytes: 12_345_678 }], 2), `${READ_ONLY}Attached files: a.txt (999 B), notes.md (size unknown), big.log (12 MB). Attached pictures: 2.`);
  assert.equal(second([{ name: 'C:\\Users\\someone\\private folder\\plan.md', bytes: 1500 }, { name: '/home/someone/src/app.ts', bytes: 0 }]), `${READ_ONLY}Attached files: plan.md (2 kB), app.ts (0 B). Attached pictures: 0.`);
  const many = second(Array.from({ length: 13 }, (_, index) => ({ name: `f${index}.ts`, bytes: 10 })));
  assert.match(many, /f9\.ts \(10 B\) and 3 more\. Attached pictures: 0\.$/);
  assert.equal(many.includes('f10.ts'), false);
  assert.equal(second([{ name: 'a\nb\t  c.txt', bytes: 1 }]), `${READ_ONLY}Attached files: a b c.txt (1 B). Attached pictures: 0.`);
  assert.match(second([{ name: `${'n'.repeat(100)}.txt`, bytes: 1 }]), new RegExp(`files: ${'n'.repeat(80)} \\(1 B\\)\\.`));
  const text = second([{ name: `${'n'.repeat(79)}\u{1F600}.txt`, bytes: 1 }]);   // the 80-character cut would otherwise fall inside the emoji
  assert.doesNotThrow(() => encodeURIComponent(text));
  assert.match(text, new RegExp(`files: ${'n'.repeat(79)} \\(1 B\\)\\.`));
});

test('text over 4,000 characters keeps the first 2,000 and the last 2,000, and never half a character', () => {
  assert.equal(MAX_CHARS, 4000);
  assert.equal(capText('a'.repeat(4000)), 'a'.repeat(4000));
  assert.equal(capText('a'.repeat(3000) + 'b'.repeat(3000)), 'a'.repeat(2000) + '\n[...]\n' + 'b'.repeat(2000));
  const emoji = capText('x' + '😀'.repeat(2500) + 'y');   // both cuts fall inside a two-unit character
  assert.doesNotThrow(() => encodeURIComponent(emoji));   // it throws on half a character
  assert.ok(emoji.length <= 4000 + '\n[...]\n'.length);
  const sent = buildDecisionRequest(judge, { ...chat, text: 'a'.repeat(3000) + 'b'.repeat(3000) }).input[0].text;
  assert.equal(sent.split('"')[1], 'a'.repeat(2000) + '\n[...]\n' + 'b'.repeat(2000), 'the cut text is what is sent');
});

test('the end of the last reply is told to the decider, after the message, and never for a helper', () => {
  const text = (input: DecideInput) => buildDecisionRequest(judge, input).input[0].text, lines = { execute: ['small edits', 'bigger changes'] };
  assert.deepEqual(text({ ...chat, lines, reply: 'Plan: change wordy.py only.' }).split('\n').slice(0, 2), ['The person\'s message: "fix the login test"', 'The end of the chat\'s last reply: "Plan: change wordy.py only."']);
  const helper: DecideInput = { kind: 'helper', text: 'Review the diff', agent: null, files: [], images: 0, lines, reply: 'Plan: change wordy.py only.' };
  for (const input of [{ ...chat, lines, reply: null }, { ...chat, lines, reply: '' }, { ...chat, lines }, helper]) assert.doesNotMatch(text(input), /last reply/);
});

test('the reply goes only when the decider is asked to choose a line, so a mode with one model is asked as before', () => {
  const request = buildDecisionRequest(judge, { ...chat, reply: 'Plan: change wordy.py only.' });
  assert.doesNotMatch(request.input[0].text, /last reply/);
  assert.match(request.questions[0].instructions, /^Which mode fits the text\?/);
});

test('with a reply, the mode is judged by the message and the line by both; without one, the questions are as before', () => {
  const lines = { execute: ['small edits in one or two files', 'bigger changes across several files'] };
  const told = buildDecisionRequest(judge, { ...chat, lines, reply: 'Plan: change wordy.py only.' }).questions;
  assert.match(told[0].instructions, /^Which mode fits the person's message\?/);
  assert.match(told[0].instructions, /last reply/);
  assert.match(told[1].instructions, /last reply/);
  assert.match(told[1].instructions, /Choose none when no description fits clearly/);
  const plain = buildDecisionRequest(judge, { ...chat, lines }).questions;
  assert.match(plain[0].instructions, /^Which mode fits the text\?/);
  assert.equal(plain[1].instructions, 'Which description of work fits the text best? Choose none when no description fits clearly.');
});

const user = (id: string) => ({ type: 'user', id, text: 'a message' });
const said = (...content: unknown[]) => ({ type: 'assistant', content });

test('the last reply is the text of the latest answer, without reasoning or tools', () => {
  const tool = { type: 'tool', name: 'read', content: [{ type: 'text', text: 'the file read' }] };
  const messages = [user('1'), said({ type: 'reasoning', text: 'think' }, { type: 'text', text: 'old' }), user('2'), said({ type: 'reasoning', text: 'r' }, tool), { type: 'idle' }, said({ type: 'text', text: 'Step 1' }, { type: 'text', text: 'Step 2' })];
  assert.equal(lastReply(messages), 'Step 1\nStep 2');
  assert.equal(lastReply([...messages, user('3')]), 'Step 1\nStep 2', 'the new message may already be listed');
  assert.equal(lastReply(messages.slice(-3)), 'Step 1\nStep 2');
});

test('a reply that is only tool calls, or no reply at all, gives nothing', () => {
  assert.equal(lastReply([]), null);
  assert.equal(lastReply(null), null);
  assert.equal(lastReply([user('1')]), null);
  assert.equal(lastReply([user('1'), said({ type: 'text', text: 'old' }), user('2'), said({ type: 'tool', name: 'edit' })]), null, 'never an earlier reply');
  assert.equal(lastReply([user('1'), said({ type: 'text', text: '  \n ' })]), null);
});

test('a long reply keeps its last 1,500 characters, and never half a character', () => {
  assert.equal(MAX_REPLY_CHARS, 1500);
  const end = (text: string) => lastReply([user('1'), said({ type: 'text', text })]);
  assert.equal(end('a'.repeat(2000) + '😀' + 'b'.repeat(1498)), '😀' + 'b'.repeat(1498));
  assert.equal(end('a'.repeat(2000) + '😀' + 'b'.repeat(1499)), 'b'.repeat(1499), 'the cut would fall inside the emoji');
});

test('the home folder is replaced with either slash and in any case, and not inside a longer folder name', () => {
  assert.equal(withoutHome('C:/USERS/me/x and c:\\users\\me\\y', 'C:\\Users\\me'), '~/x and ~\\y');
  assert.equal(withoutHome('C:\\Users\\me2\\x and C:\\Users\\me.old', 'C:\\Users\\me'), 'C:\\Users\\me2\\x and C:\\Users\\me.old');
  assert.equal(withoutHome('/home/me/src, /home/me', '/home/me/'), '~/src, ~');
  assert.equal(withoutHome('a/b', '/'), 'a/b', 'a home with no name is left alone');
  // A sentence can end right after the folder, and models working through Git Bash or WSL write a Windows home as /c/... or /mnt/c/....
  assert.equal(withoutHome('It is in C:\\Users\\someone. Next, C:\\Users\\someone-old', 'C:\\Users\\someone'), 'It is in ~. Next, C:\\Users\\someone-old');
  assert.equal(withoutHome('/c/Users/someone/proj and /mnt/c/users/someone/x', 'C:\\Users\\someone'), '~/proj and ~/x');
});

test('the home folder is hidden before the reply is cut, so no part of it is left', () => {
  const home = 'C:\\Users\\someone', path = `${home}\\relay-bench\\wordy.py`;
  // Cut after the home folder is named, the last 1,500 characters would start inside "someone".
  const text = 'x'.repeat(2000) + path + 'y'.repeat(2012 + MAX_REPLY_CHARS - 2000 - path.length);
  const end = lastReply([user('1'), said({ type: 'text', text })], home) ?? '';
  assert.equal(end.includes('eone'), false, end.slice(0, 40));
  assert.ok(end.includes('~\\relay-bench\\wordy.py'));
});

test('a readable answer becomes the mode, the confidence, the cost and the lines', async () => {
  const answer = await decide({ decisions: async () => reply('review', 0.97) }, judge, chat);
  assert.deepEqual({ ...answer, ms: 0 }, { kind: 'answer', mode: 'review', confidence: 0.97, lines: {}, costUsd: '0', ms: 0 });
  const lines = { plan: ['a', 'b'], execute: ['c'], review: ['d', 'e', 'f'] };
  const answers = [choice('review_line', '3', 0.6), choice('plan_line', '2', 0.8), choice('mode', 'plan', 0.9), choice('execute_line', 'none', 0.7)];
  const full = await decide({ decisions: async () => ({ answers, cost: 0.000012 }) }, judge, { ...chat, lines });
  assert.deepEqual({ ...full, ms: 0 }, { kind: 'answer', mode: 'plan', confidence: 0.9, lines: { plan: { index: 1, confidence: 0.8 }, execute: { index: null, confidence: 0.7 }, review: { index: 2, confidence: 0.6 } }, costUsd: '0.000012', ms: 0 });
  assert.equal(((await decide({ decisions: async () => ({ answers: [choice('mode', 'plan', 0.9)] }) }, judge, chat)) as { costUsd: unknown }).costUsd, null, 'no cost reported is unknown, not zero');
});

test('a line answer that cannot be used is left out, and the mode still counts', async () => {
  const lines = { plan: ['a', 'b'] };
  const unusable = [choice('plan_line', '3', 0.9), choice('plan_line', '0', 0.9), choice('plan_line', 2, 0.9), choice('plan_line', true, 0.9), choice('plan_line', '1', 1.5), choice('plan_line', '1', '0.9'), choice('plan_line', '1', Number.NaN),
    { type: 'error', name: 'plan_line', reason: 'refused' }, choice('other_line', '1', 0.9), choice('review_line', '1', 0.9), choice('review_line', 'none', 0.9), null, 'plan_line'];
  for (const extra of unusable) {
    const answer = await decide({ decisions: async () => reply('plan', 0.9, extra) }, judge, { ...chat, lines });
    assert.deepEqual({ ...answer, ms: 0 }, { kind: 'answer', mode: 'plan', confidence: 0.9, lines: {}, costUsd: '0', ms: 0 }, JSON.stringify(extra));
  }
});

test('anything else counts as no answer', async () => {
  const none = async (result: () => Promise<unknown>, decider: typeof judge | null = judge) => { const a = await decide({ decisions: result }, decider, chat); assert.equal(a.kind, 'none'); return (a as { reason: string }).reason; };
  assert.equal(await none(async () => { throw new Error('must not be called'); }, null), 'no decider chosen');
  assert.equal(await none(async () => { throw new Error('ProviderRequestError: 503'); }), 'the decider gave no answer: ProviderRequestError: 503');
  assert.equal(await none(() => { throw new Error('thrown before a promise existed'); }), 'the decider gave no answer: thrown before a promise existed');
  assert.equal(await none(async () => { throw new Error(`long\n${'x'.repeat(400)}`); }), `the decider gave no answer: long ${'x'.repeat(195)}`);
  assert.equal(await none(async () => ({ answers: [{ type: 'error', name: 'mode', reason: 'refused' }] })), 'the decider gave no answer: refused');
  for (const bad of [reply('unsure', 0.9), reply(true, 0.9), reply('plan', 1.2), reply('plan', -0.1), reply('plan', Number.NaN), reply('plan', '0.9'), { answers: [] }, { answers: [null] }, { answers: [{ ...choice('mode', 'plan', 0.9), name: 'other' }] }, { answers: [{ ...choice('mode', 'plan', 0.9), type: 'score' }] }, null, 'plan', undefined])
    assert.equal(await none(async () => bad), "the decider's answer could not be read");
});

test('it gives up after the time limit and ignores a late answer and a late failure', async () => {
  assert.equal(TIMEOUT_MS, 5000);
  let calls = 0;
  const slow = { decisions: () => { const nth = ++calls; return new Promise((done, fail) => setTimeout(() => nth === 1 ? done(reply('execute', 0.99)) : fail(new Error('late')), 40)); } };
  for (const _ of [1, 2]) { const a = await decide(slow, judge, chat, 10); assert.deepEqual([a.kind, (a as { reason: string }).reason], ['none', 'the decider took longer than 0.01 seconds']); }
  await new Promise(done => setTimeout(done, 60));   // the late failure must not surface as an unhandled rejection
});

const SIZE_CHOICES = [
  { value: 'small', description: 'Small and clear. A quick question or a simple edit in one or two files, with nothing tricky to get right.' },
  { value: 'big', description: 'Big, unclear or risky. Several files, a new feature, a hard bug, many rules or edge cases to get right, data, money or security, or the last reply shows a failed try.' },
];

test('a mode whose size is asked gets the size question word for word, and the reply goes with it', () => {
  const request = buildDecisionRequest(judge, { kind: 'chat', text: 'Implement it.', agent: 'plan', files: [], images: 0, lines: {}, sizes: ['execute'], reply: 'Plan: one file.' });
  assert.deepEqual(request.questions[1], { type: 'choice', name: 'execute_size', instructions: "How big is the work? Judge by the person's message and the end of the chat's last reply.", choices: SIZE_CHOICES });
  assert.equal(request.questions.length, 2);
  assert.ok(request.input[0].text.includes(`The end of the chat's last reply: "Plan: one file."`));
});

test('without a reply, the size question asks about the text alone', () => {
  const request = buildDecisionRequest(judge, { ...chat, sizes: ['review'] });
  assert.deepEqual(request.questions[1], { type: 'choice', name: 'review_size', instructions: 'How big is the work the text asks for?', choices: SIZE_CHOICES });
  assert.ok(!request.input[0].text.includes('last reply'));
});

test('a size answer is read when it is small or big with a confidence, and only for a mode that was asked', async () => {
  const host = { decisions: async () => reply('execute', 0.95, choice('execute_size', 'small', 0.98), choice('plan_size', 'big', 0.9)) };
  const answer = await decide(host, judge, { ...chat, sizes: ['execute'] });
  assert.deepEqual((answer as { sizes?: unknown }).sizes, { execute: { size: 'small', confidence: 0.98 } });
});

test('a malformed size answer is left out', async () => {
  for (const bad of [choice('execute_size', 'medium', 0.9), choice('execute_size', 'big', 1.2), choice('execute_size', 'big', '0.9')]) {
    const answer = await decide({ decisions: async () => reply('execute', 0.95, bad) }, judge, { ...chat, sizes: ['execute'] });
    assert.deepEqual((answer as { sizes?: unknown }).sizes, {});
  }
});

// 25 Nov: the size question also sees the task the chat is working on, since a short follow-up ("Review the implementation") says
// nothing of how hard the task is (docs/superpowers/specs/2026-11-25-relay-size-sees-the-task-design.md).
test('the task a chat works on is its first message, with the home folder hidden, at most its first 1,500 characters', () => {
  const answered = { type: 'assistant', content: [{ type: 'text', text: 'Plan: one file.' }] };
  assert.equal(firstRequest([{ type: 'synthetic', text: 'host text' }, user('1'), answered, { type: 'user', id: '2', text: 'Implement it.' }]), 'a message');
  const hidden = firstRequest([{ type: 'user', id: '1', text: 'Fix C:\\Users\\someone\\app\\x.py please' }], 'C:\\Users\\someone') ?? '';
  assert.ok(hidden.includes('~\\app\\x.py') && !hidden.includes('someone'), hidden);
  assert.equal(MAX_TASK_CHARS, 1500);
  assert.equal(firstRequest([{ type: 'user', id: '1', text: 'b'.repeat(2000) }]), 'b'.repeat(1500));
  for (const messages of [[], null, [{ type: 'user', id: '1', text: '   ' }], [answered]]) assert.equal(firstRequest(messages), null);
});

test('with a size asked, the decider is told the task, and the size question judges by it', () => {
  const request = buildDecisionRequest(judge, { kind: 'chat', text: 'Review the implementation.', agent: 'build', files: [], images: 0, lines: {}, sizes: ['review'], reply: 'Done: forth.py written.', task: 'Implement a Forth interpreter with user-defined words.' });
  assert.ok(request.input[0].text.includes('The task the chat is working on: "Implement a Forth interpreter with user-defined words."'), request.input[0].text);
  assert.equal(request.questions[1].instructions, "How big is the work? Judge by the task the chat is working on, the person's message and the end of the chat's last reply.");
  const first = buildDecisionRequest(judge, { ...chat, text: 'Plan it.', sizes: ['plan'], task: 'Build a bowling scorer.' });
  assert.equal(first.questions[1].instructions, "How big is the work? Judge by the task the chat is working on and the person's message.");
});

test('the task is not told when no size is asked, or when it is the message itself, so those requests stay as measured', () => {
  const inputs: DecideInput[] = [{ ...chat, task: 'Build a bowling scorer.' }, { ...chat, sizes: ['plan'], task: ` ${chat.text} ` }, { ...chat, sizes: ['plan'], task: null }];
  for (const input of inputs) assert.doesNotMatch(buildDecisionRequest(judge, input).input[0].text, /task the chat/);
  assert.equal(buildDecisionRequest(judge, { ...chat, sizes: ['review'], task: chat.text }).questions[1].instructions, 'How big is the work the text asks for?');
});
