# Spring 框架面试知识点

## 核心容器
- **IoC 容器**：BeanFactory vs ApplicationContext、Bean 生命周期（实例化/属性注入/初始化/销毁）、循环依赖（三级缓存）
- **依赖注入**：字段注入 vs Setter 注入 vs 构造器注入、@Autowire vs @Resource vs @Inject
- **作用域**：Singleton / Prototype / Request / Session，单例 Bean 的线程安全问题

## Spring MVC
- **请求流程**：DispatcherServlet → HandlerMapping → Controller → ViewResolver
- **拦截器**：Interceptor vs Filter 区别、执行顺序

## Spring Boot
- **自动配置**：@EnableAutoConfiguration / @Conditional / spring.factories 机制
- **启动流程**：SpringApplication 启动过程、ApplicationContext 刷新

## 数据访问与事务
- **声明式事务**：@Transactional 原理（AOP + 事务管理器）、事务传播行为（REQUIRED / REQUIRES_NEW / NESTED 等）
- **隔离级别与回滚规则**

## 常考题型示例
1. Spring 如何解决循环依赖？为什么构造器注入无法解决？
2. Bean 的生命周期是怎样的？有哪些扩展点可以介入？
3. @Transactional 原理是什么？什么情况下事务会失效？
4. Spring Boot 的自动配置是如何实现的？如何自定义 Starter？
5. Spring AOP 的底层实现？JDK 动态代理和 CGLIB 的区别？
6. 一个请求从进入 Spring MVC 到返回响应的完整流程？
