# MySQL 面试知识点

## 核心概念
- **存储引擎**：InnoDB vs MyISAM 区别、InnoDB 行锁与聚簇索引
- **索引结构**：B+ 树特性、聚簇索引 vs 二级索引、联合索引最左前缀原则、索引下推
- **事务与隔离级别**：ACID、READ UNCOMMITTED / READ COMMITTED / REPEATABLE READ / SERIALIZABLE、MVCC 原理、间隙锁
- **锁机制**：行锁、表锁、意向锁、死锁检测与处理
- **SQL 优化**：EXPLAIN 执行计划解读、慢查询分析、覆盖索引、索引失效场景

## 高可用
- 主从复制原理（binlog）、读写分离
- 分库分表策略（垂直/水平）、ShardingSphere/MyCat

## 常考题型示例
1. 讲一下 MySQL 的 B+ 树索引结构，为什么不用 B 树或红黑树？
2. 什么是 MVCC？它在 RC 和 RR 隔离级别下有什么区别？
3. 慢查询如何定位和优化？EXPLAIN 中 type 字段的各取值含义？
4. 什么情况下索引会失效？你遇到过哪些索引失效的场景？
5. 解释间隙锁（Gap Lock）的作用，什么隔离级别下会触发？
6. 如何设计一个高并发场景下的秒杀系统数据库表？
