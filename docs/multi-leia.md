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

`openingLeiaId` controls the first actor in the deterministic traversal. `problemLeiaId` is independent and identifies the LEIA whose problem supplies the scenario, widgets, solution and evaluation for the whole activity.

Every actor keeps its own persona and behaviour. The actor's original problem is ignored. The runtime explicitly applies the behaviour's method, role and tone to the shared problem, and Designer rejects publication when a behaviour's `process` differs from the shared problem's `process`.

## Runtime graph

Runner builds an implicit graph with the participant, every LEIA actor and an end node. The graph is not persisted as authored edges. Each participant turn explores a deterministic rotating slice of the actors:

1. The current opening actor addresses the next actor.
2. Further actors continue the public discussion.
3. The final actor addresses the participant and asks the next useful question.
4. The opening position rotates for the next participant turn.

The number of actor steps is between two and five and cannot exceed the number of actors.

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

If an actor fails after earlier actors have already answered, Runner returns those saved messages with `partial: true`, records the failed actor in `state.lastPartial`, and makes that actor the opening node of the next traversal. A fully successful traversal clears the partial state.
