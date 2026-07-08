# HTML / CSS 面试知识点

## HTML
- **语义化标签**：header / nav / main / article / section / aside / footer 使用场景
- **可访问性**：ARIA 属性、role、alt 文本、键盘导航
- **SEO 基础**：title / meta description / canonical / 结构化数据
- **表单**：input 类型、表单验证、无障碍表单

## CSS
- **布局**：Flexbox（主轴/交叉轴、flex 属性） vs Grid（grid-template / auto-fit / minmax）
- **盒子模型**：content-box vs border-box、margin 重叠
- **定位**：static / relative / absolute / fixed / sticky
- **响应式**：媒体查询、相对单位（rem / em / vw / vh / %）、clamp()
- **CSS 动画**：transition / animation / @keyframes、transform 3D、GPU 加速
- **预处理器**：SASS / LESS 变量、嵌套、mixin

## 工程化
- BEM 命名规范、CSS Modules、CSS-in-JS、Tailwind CSS
- 层叠上下文（z-index 堆叠规则）、BFC（块格式化上下文）

## 常考题型示例
1. 讲一下 Flexbox 和 Grid 各自最适合什么场景？区别是什么？
2. 什么是 BFC？什么时候会触发 BFC？BFC 有什么用？
3. 如何实现一个水平垂直居中的方案？（至少列举 3 种）
4. CSS 选择器的优先级是怎么计算的？
5. 什么是重排（Reflow）和重绘（Repaint）？如何减少？
6. 移动端 1px 边框怎么实现？
