# Multi-threaded Collision System Optimization Proposal

## 1. Introduction

The current `ExactCollisionSystem` provides accurate collision detection and response for a large number of dynamic objects. It uses a spatial grid to limit the number of collision checks to nearby entities. However, as the number of entities grows, the collision detection phase, which runs on the main thread, can still become a bottleneck, potentially leading to frame rate drops and a less smooth user experience.

This document proposes an optimization strategy to parallelize the collision detection process using Web Workers to leverage multi-core processors, thereby offloading work from the main thread and improving overall performance.

## 2. Proposed Solution: Web Workers

Web Workers provide a mechanism to run scripts in background threads, allowing for concurrent execution of code without blocking the main UI thread. We can divide the collision detection workload among several workers to perform checks in parallel.

There are two primary approaches for data communication with Web Workers:

### Approach A: Message Passing (`postMessage`)

-   **Description**: The main thread serializes and sends the necessary entity data (positions, collider shapes) to each worker every frame. Workers perform their calculations and send the results (a list of colliding pairs) back.
-   **Pros**:
    -   Relatively simple to implement.
    -   Does not require major architectural changes to how component data is stored.
-   **Cons**:
    -   Incurs overhead from serializing/deserializing data on every frame. Performance gains are only realized if the computation savings outweigh this communication overhead.

### Approach B: Shared Memory (`SharedArrayBuffer`)

-   **Description**: Entity data is stored in `SharedArrayBuffer`s, which can be accessed by both the main thread and worker threads without any copying. This provides near-instant data access for workers.
-   **Pros**:
    -   Extremely low communication overhead, leading to maximum performance.
    -   Scales very well with a high number of entities and complex calculations.
-   **Cons**:
    -   Requires a significant architectural refactor to store component data in flat, typed arrays instead of class instances.
    -   Requires careful synchronization using `Atomics` to prevent race conditions.
    -   Requires specific server headers (`COOP`, `COEP`) for security reasons, which can complicate deployment.

**Recommendation**: We will start with **Approach A (`postMessage`)**. It allows us to build the parallel processing pipeline and validate the performance benefits with less initial implementation complexity. We can later migrate to `SharedArrayBuffer` if the data transfer overhead proves to be a bottleneck.

## 3. Implementation Strategy: Parallel Detection, Serial Resolution

To avoid the complexities of concurrent state mutations (race conditions), we will adopt a two-phase approach:

1.  **Phase 1: Collision Detection (Parallel)**
    -   The main thread will gather the state of all relevant entities.
    -   The spatial grid cells will be divided amongst a pool of Web Workers.
    -   Each worker will receive the full list of relevant entities and its assigned cells.
    -   Workers will independently check for collisions within their assigned regions and report back a list of colliding entity pairs.

2.  **Phase 2: Collision Resolution (Serial)**
    -   The main thread will wait for all workers to complete their tasks.
    -   It will then aggregate the results from all workers.
    -   Finally, it will iterate through the unique collision pairs and perform the resolution logic (positional correction, velocity changes) sequentially. This ensures that the state changes are deterministic and free of race conditions.

## 4. Plan for Code Modification

1.  **Create a Collision Worker (`collision.worker.ts`)**:
    -   This script will contain the logic for collision checking.
    -   It will listen for messages from the main thread, perform the calculations, and post the results back.

2.  **Create a New System (`ParallelCollisionSystem.ts`)**:
    -   This new system will manage the lifecycle of the Web Worker pool.
    -   In its `update` method, it will implement the "Parallel Detection, Serial Resolution" strategy described above.
    -   It will largely replicate the collision logic from `ExactCollisionSystem` but adapt it to the worker-based asynchronous flow.

3.  **Integrate the New System**:
    -   The `ParallelCollisionSystem` will be added to the ECS world in the simulator, replacing the `ExactCollisionSystem`.

This phased approach allows for a controlled implementation and provides a clear path for future optimizations.
