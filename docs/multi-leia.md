# MultiLEIA text orchestration

## Ownership

MultiLEIA activities are authored in Designer. Workbench stores the published experiment snapshot, configures a text model and API key for every actor, and starts the runtime in Runner.

## Activity model

An activity contains at least two LEIA configurations and one orchestration object:

```json
{
  "mode": "multi",
  "openingLeiaId": "activity-leia-config-id",
  "problemLeiaId": "activity-leia-config-id",
  "maxInternalTurns": 2,
  "sharedTask": "Optional common objective"
}
```

`openingLeiaId` is the fallback first actor if dynamic routing is unavailable. `problemLeiaId` is independent and identifies the LEIA whose problem supplies the scenario, widgets, solution and evaluation for the whole activity. `maxInternalTurns` is a safety ceiling, not a required number of messages.

Every actor keeps its own persona and behaviour. The actor's original problem is ignored. The runtime explicitly applies the behaviour's method, role and tone to the shared problem, and Designer rejects publication when a behaviour's `process` differs from the shared problem's `process`.

## Runtime graph

Runner builds an implicit graph with the participant, every LEIA actor and an end node. The graph is not persisted as authored edges. A private orchestrator session selects the next graph node before every public LEIA message:

1. It can select any LEIA except the actor that just spoke.
2. It selects another LEIA only when that role materially adds to the exchange.
3. It selects the participant when the latest answer is sufficient or participant input is required.
4. The configured maximum always stops the round even if the router would continue.

A round can therefore contain one to eight public LEIA messages. Actors may speak again later in the same round, so the maximum can be greater than the number of configured LEIAs. Invalid router output falls back to a deterministic opening actor and returns control after its response.

Runner exposes the traversal as one SSE response. It emits `route` before an actor starts, `message` after each public response, and `complete` when control returns to the participant. Workbench persists every message before forwarding it through its own SSE stream to the browser.

## Shared memory and isolation

Every actor has an isolated provider session. Runner also keeps one ordered public transcript with labeled senders. Before an actor speaks, it receives only the public events added since its own cursor. Its provider session preserves its private conversation state, while the labeled transcript gives it the messages produced by the participant and the other LEIAs.

The persisted public event fields are `sequence`, `senderType`, `senderId`, `senderName`, `recipientIds`, `text`, `turnId` and `timestamp`.

## Current constraints

- Text mode only.
- At least two LEIAs.
- One shared problem per activity.
- No function-tool continuation inside a MultiLEIA turn.
- One traversal at a time per session, protected by a Redis lock.
- A `turnId` acts as an idempotency key for completed Runner turns.

If an actor fails after earlier actors have already answered, Runner returns those saved messages with `partial: true`, records the failed actor in `state.lastPartial`, and makes that actor the preferred fallback node of the next traversal. A fully successful traversal clears the partial state.
