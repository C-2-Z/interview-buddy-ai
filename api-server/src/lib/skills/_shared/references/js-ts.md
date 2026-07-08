# JavaScript / TypeScript 面试知识点

## JavaScript 核心
- **作用域与闭包**：全局/函数/块级作用域、闭包的定义与应用场景（模块化/防抖/柯里化）
- **this**：默认绑定/隐式绑定/显式绑定（call/apply/bind）/ new 绑定、箭头函数
- **原型链**：prototype / __proto__ / constructor、原型链继承、ES6 Class 本质
- **异步编程**：Event Loop（宏任务/微任务）、Promise 链式调用/错误处理、async/await 原理、Generator
- **ES6+**：解构赋值、模板字符串、Set/Map、Symbol、Proxy/Reflect

## TypeScript
- **类型系统**：interface vs type、泛型（泛型约束/条件类型/映射类型）
- **工具类型**：Partial / Required / Pick / Omit / Record / Exclude / Extract / ReturnType
- **高级**：infer 关键字、模板字面量类型、装饰器、类型守卫（is / in / typeof / instanceof）

## 常考题型示例
1. 闭包是什么？在实际项目中你在哪些场景用过闭包？
2. 讲一下 JavaScript 的事件循环机制（Event Loop），宏任务和微任务有哪些？
3. Promise.all、Promise.race、Promise.allSettled 有什么区别？
4. 手写实现一个深拷贝（考虑循环引用、Map/Set/Date/RegExp 等特殊对象）
5. TypeScript 中 type 和 interface 的区别？什么场景用哪个？
6. TypeScript 的 infer 关键字是干什么的？举一个实际使用的例子？
7. 手写实现一个 debounce 或 throttle 函数
8. 原型链继承的几种方式及各自的优缺点？
