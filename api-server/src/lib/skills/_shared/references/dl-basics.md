# 深度学习与模型面试知识点

## 神经网络基础
- **结构与原理**：全连接层、激活函数（ReLU / Sigmoid / Tanh / GELU / Swish）、前向/反向传播
- **优化器**：SGD / Momentum / AdaGrad / RMSProp / Adam 原理与对比
- **初始化**：Xavier / He 初始化、Batch Normalization / Layer Normalization

## CNN
- **核心层**：卷积层（感受野/参数共享/填充/步长）、池化层、1×1 卷积
- **经典架构**：VGGNet / ResNet（残差连接） / Inception / MobileNet（深度可分离卷积）

## RNN / Transformer
- **序列模型**：RNN / LSTM（门控机制） / GRU、梯度消失/爆炸
- **Attention**：Self-Attention / Multi-Head Attention、位置编码、Transformer 架构（Encoder-Decoder）
- **预训练**：BERT（Masked LM） / GPT（自回归）/ ViT

## 训练技巧
- **防止过拟合**：Dropout / Data Augmentation / 正则化 / Label Smoothing
- **学习率策略**：Warmup / Cosine Decay / ReduceLROnPlateau
- **分布式训练**：数据并行 / 模型并行 / FSDP / ZeRO

## 常考题型示例
1. 反向传播的链式求导过程？梯度消失和梯度爆炸的原因和解决方案？
2. Dropout 的原理是什么？训练和推理阶段有什么区别？
3. Batch Normalization 的训练和推理阶段有什么区别？
4. Transformer 的 Self-Attention 复杂度是 O(n²) 的，有什么优化方法？
5. LSTM 如何解决 RNN 的长期依赖问题？
6. ResNet 为什么能训练很深的网络？残差连接的作用是什么？
7. Warmup 学习率策略有什么作用？为什么训练初期需要较小的学习率？
8. 对比 BERT 和 GPT 的模型结构差异和适用场景？
