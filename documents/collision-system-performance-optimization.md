# Collision System Performance Optimization Guide

This document summarizes the key performance optimization strategies applied to the collision detection system in our ECS-based game engine. These techniques are generally applicable to any high-performance game or simulation that involves frequent collision checks among many entities.

---

## 1. Avoiding String Operations in Hot Paths

**Problem:**  
String operations (such as concatenation, splitting, and parsing) are expensive in JavaScript/TypeScript, especially when performed in tight loops or hot code paths. In the original implementation, entity pair keys for collision checks were generated using string concatenation or by parsing entity IDs.

**Solution:**  
- Use numeric IDs for entities and generate pair keys using bitwise operations.
- For example, instead of `id1 + '-' + id2`, use `(id1 << 20) | id2` (assuming entity count < 1 million).
- This approach eliminates string allocation and parsing, significantly reducing CPU and GC overhead.

---

## 2. Assigning Numeric IDs to Entities

**Problem:**  
Entities were identified only by string IDs, which made numeric optimizations impossible.

**Solution:**  
- Assign a unique, auto-incrementing numeric ID (`numericId`) to each entity at creation time.
- Use this `numericId` for all internal, performance-critical operations (such as collision pair keys).

---

## 3. Using Numeric Keys in Sets and Maps

**Problem:**  
JavaScript's `Set<string>` and `Map<string, ...>` are slower than their numeric counterparts due to string hashing and comparison.

**Solution:**  
- Use `Set<number>` and `Map<number, ...>` wherever possible for fast lookups and insertions.
- Generate unique numeric keys for entity pairs using their numeric IDs and bitwise operations.

---

## 4. Optimizing Collision Matrix Lookups

**Problem:**  
The collision matrix (used to filter which entity types should check for collisions) originally used string keys like `"player-enemy"`.

**Solution:**  
- Change the `EntityType` enum to a numeric enum.
- Use bitwise operations to generate a unique numeric key for each unordered pair of types.
- Store the collision matrix as a `Map<number, Set<EntityType>>` for fast, allocation-free lookups.

---

## 5. Object and Array Reuse

**Problem:**  
Frequent allocation of temporary arrays and objects (such as for positions, collision areas, and nearby entity lists) can cause GC pressure and performance spikes.

**Solution:**  
- Reuse pre-allocated arrays and objects for temporary data within the collision system.
- Clear arrays by setting `length = 0` instead of creating new arrays.

---

## 6. General Recommendations

- **Profile regularly:** Use browser devtools to identify new hot spots as your code evolves.
- **Avoid unnecessary allocations:** Especially in per-frame or per-entity logic.
- **Prefer numbers over strings:** For all internal, high-frequency operations.
- **Cache and reuse:** Where possible, cache results and reuse objects to minimize GC.

---

## Example: Numeric Pair Key Generation

```typescript
private getNumericPairKey(id1: number, id2: number): number {
  // Ensure order independence
  return id1 < id2 ? (id1 << 20) | id2 : (id2 << 20) | id1;
}
```

## Example: Type Pair Key for Collision Matrix

```typescript
private getTypePairKey(type1: EntityType, type2: EntityType): number {
  // Use 4 bits for each type (supports up to 16 types)
  return type1 < type2 ? (type1 << 4) | type2 : (type2 << 4) | type1;
}
```

---

## Conclusion

By eliminating string operations, using numeric IDs, and reusing objects, the collision system can handle thousands of entities with minimal CPU and memory overhead. These optimizations are essential for maintaining smooth gameplay and scalability in real-time applications. 