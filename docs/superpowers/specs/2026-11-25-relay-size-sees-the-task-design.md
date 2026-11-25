# Relay's size question sees the task (25 Nov 2026)

A short design. The owner chose it ("Show it the task") after the cost test of 24 Nov.

## Why

Relay's own choice inside a mode asks the decider how big the work is, judged by the person's message and the end of the chat's last reply. In the cost test, Plan and Review held Flash and Kimi with no lines, and the decider judged all 12 plans and reviews small. So Flash did everything and failed the three harder exercises. The messages were short follow-ups ("Review the implementation for mistakes and missed cases"), which say nothing of how hard the task is.

## Design

- The decider also gets the chat's first message, the task, at most its first 1,500 characters, with the home folder hidden (`firstRequest` in `src/decider.ts`).
- It is told only with a size question, and only when it is not the message itself. Every other request stays word for word as measured on 14 to 23 Nov.
- With the task, the size question reads "How big is the work? Judge by the task the chat is working on, the person's message and the end of the chat's last reply" (or without the last part when there is no reply).
- shortcut: a compacted chat is listed from its summary on, so its task is the first message after the summary.

## Approaches the owner weighed

- **Show it the task:** chosen. It fixes the cause (the decider never saw the task) and keeps one question.
- A risk question for Review ("how risky would a mistake be"): a second kind of question, still blind to the task.
- Review always on the strong model: simplest, but no saving in Review at all.

## Privacy

One more piece of the chat's own text goes to the decision model, and only when Relay chooses by itself in a mode: the start of the chat's first message. `docs/privacy.md` says so.

## Testing

Unit tests for the task's text and when it is told. Then ten made-up cases (`scripts/decider-size-task-cases.json`): short follow-ups whose task is hard (five, labelled big) or easy (five, small), asked of the free decision model from an isolated OpenCode. The bar, fixed before the run: at least 8 of 10 right. Then, with the owner's word, the `on-size` setup on Go again.
