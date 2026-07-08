# Java 基础面试知识点

## 核心语言特性
- **JVM 内存模型**：堆、栈、方法区、程序计数器、本地方法栈；对象创建过程、内存分配策略
- **垃圾回收**：GC Root 可达性分析、引用类型（强/软/弱/虚）、GC 算法（标记-清除/复制/标记-整理）、分代收集、CMS/G1/ZGC
- **并发编程**：synchronized 原理（偏向锁/轻量级锁/重量级锁升级）、volatile 内存语义、AQS 框架、ReentrantLock、线程池参数与拒绝策略
- **集合框架**：HashMap 扩容机制与红黑树退化、ConcurrentHashMap 分段锁/CAS 演进、ArrayList vs LinkedList
- **Java 8+ 新特性**：Lambda 表达式、Stream API、Optional、CompletableFuture、模块系统
- **异常体系**：Checked vs Unchecked、异常链、try-with-resources
- **反射与注解**：反射性能开销、运行时注解 vs 编译时注解（APT）

## JVM 调优
- 常用 GC 参数、堆大小配置、OOM 分析与 MAT 工具
- 类加载机制：双亲委派模型、打破双亲委派（Tomcat/SPI）

## 常考题型示例
1. 讲一下 HashMap 在并发场景下的问题，ConcurrentHashMap 是如何解决的？
2. 线程池的核心参数有哪些？提交一个任务后线程池的执行流程是怎样的？
3. JVM 如何判断一个对象可以被回收？GC Root 有哪些？
4. synchronized 和 ReentrantLock 的区别？分别在什么场景下选择？
5. volatile 能保证原子性吗？为什么？它保证的是什么？
