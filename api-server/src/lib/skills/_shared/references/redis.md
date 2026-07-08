# Redis 面试知识点

## 核心概念
- **数据结构**：String / Hash / List / Set / Sorted Set / Bitmap / HyperLogLog / GEO / Stream
- **持久化**：RDB（快照） vs AOF（追加日志）、混合持久化、fork 时 COW 机制
- **高可用**：主从复制、Sentinel 哨兵模式、Redis Cluster 分片
- **缓存策略**：过期策略（定期删除 + 惰性删除）、内存淘汰机制（LRU / LFU / TTL / Random）
- **缓存问题**：缓存穿透（布隆过滤器）、缓存击穿（互斥锁 / 逻辑过期）、缓存雪崩（随机过期时间）

## 高级特性
- Redis 事务（WATCH/MULTI/EXEC）、Lua 脚本、Pipeline 批量操作
- 分布式锁（RedLock、SET NX + Lua）、Redis 实现消息队列

## 常考题型示例
1. Redis 的 String 底层使用什么数据结构？SDS 相对 C 字符串的优势？
2. 缓存穿透、缓存击穿、缓存雪崩有什么区别？各自怎么解决？
3. 如何用 Redis 实现分布式锁？有哪些注意事项（死锁、续期、集群）？
4. Redis 主从同步的原理是什么？增量同步和全量同步分别在什么情况下触发？
5. 讲一下 Redis 的过期键删除策略，对内存和 CPU 的影响？
6. Redis Cluster 的哈希槽（hash slot）是如何分配的？节点扩容时数据如何迁移？
