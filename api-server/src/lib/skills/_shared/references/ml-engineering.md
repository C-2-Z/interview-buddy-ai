# 模型工程与部署面试知识点

## 数据处理
- **特征存储**：Feature Store（特征在线/离线一致性）、特征回溯
- **数据管道**：批处理 vs 流处理、数据质量监控（异常检测/分布漂移）、ETL 流程
- **数据版本管理**：DVC / LakeFS、数据血缘追踪

## 模型训练
- **训练基础设施**：GPU 多卡训练（DataParallel / DistributedDataParallel）、混合精度训练（AMP）
- **实验管理**：MLflow / Weights & Biases / TensorBoard、超参数搜索（Grid / Random / Bayesian）
- **模型版本管理**：模型注册表、模型存储与加载、回滚策略

## 模型部署
- **推理服务**：模型序列化（ONNX / TorchScript / TensorRT）、REST 与 gRPC 服务化
- **推理优化**：模型量化（INT8 / FP16）、模型剪枝、蒸馏、批处理推理
- **服务架构**：Kubernetes + Istio / Seldon Core / BentoML、弹性伸缩
- **监控告警**：推理延迟监控、吞吐量监控、模型性能衰减检测（Data Drift / Concept Drift）

## A/B 实验
- **实验设计**：Randomization Unit、流量分割、最小样本量计算
- **评估**：假设检验（t-test / z-test）、Multiple Testing Correction（Bonferroni / FDR）

## 常考题型示例
1. 从模型训练完成到上线服务，整个 MLOps 的流程是怎样的？
2. 特征线上和线下不一致的问题怎么排查和解决？
3. 模型量化有哪几种方式？量化后精度一定会下降吗？
4. 模型部署后如何监控模型效果？数据漂移怎么检测？
5. 如何设计一个 A/B 实验平台？分流逻辑如何处理用户重叠？
6. 大规模特征存储（Feature Store）怎么设计？如何保证低延迟读取？
7. GPU 显存不够训练大模型时有什么优化手段？
8. CD 系统中模型的金丝雀发布（Canary Release）策略怎么设计？
