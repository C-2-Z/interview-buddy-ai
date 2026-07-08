# 前端框架与工程化面试知识点

## React
- **组件与状态**：函数组件 vs Class 组件、受控组件 vs 非受控组件
- **Hooks**：useState / useEffect / useCallback / useMemo / useRef / useContext 原理与使用、自定义 Hook
- **虚拟 DOM**：Fiber 架构、Reconciliation（Diff 算法）、key 的作用
- **状态管理**：Context 与 useReducer、Redux/Zustand 原理、不可变数据
- **渲染优化**：React.memo / useMemo / useCallback、懒加载（React.lazy + Suspense）
- **Rust 编译**：React 19 + 新编译器

## Vue
- **响应式原理**：Vue 2 defineProperty vs Vue 3 Proxy、依赖收集与派发更新
- **模板编译**：AST 编译、render 函数、diff 优化（静态标记 / PatchFlag）
- **组合式 API**：ref / reactive / computed / watch / provide-inject
- **生态**：Pinia vs Vuex、Vue Router、Nuxt SSR

## 工程化
- **模块化**：ES Module vs CommonJS vs UMD
- **打包工具**：Webpack 核心原理（Loader / Plugin / Tree Shaking）、Vite（ESM + 预构建）
- **代码质量**：ESLint + Prettier、Husky + lint-staged、单元测试（Vitest / Jest）

## 常考题型示例
1. React 中 useEffect 的依赖数组是如何比较的？空数组和传变量有什么区别？
2. 虚拟 DOM 一定比直接操作真实 DOM 快吗？为什么？
3. Vue 3 的响应式原理和 Vue 2 有什么区别？Proxy 比 defineProperty 好在哪？
4. React 中 key 的作用是什么？为什么不建议用数组索引作为 key？
5. 什么是闭包陷阱？在 React Hooks 中如何避免？
6. Vite 比 Webpack 快在哪些方面？HMR 原理有什么区别？
7. 如何设计一个可复用的组件？考虑哪些设计原则？
8. 前端项目如何进行性能优化？（加载/渲染/运行时）
