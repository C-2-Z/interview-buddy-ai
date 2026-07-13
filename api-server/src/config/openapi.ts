/** AI 面试模拟器 OpenAPI 3.0 规范 */
export const OPENAPI_DOC = {
  "openapi": "3.0.3",
  "info": {
    "title": "AI 面试模拟器 API",
    "description": "AI 驱动的面试练习平台后端接口。支持创建文本/语音面试、AI 出题、逐题评分、综合报告生成。",
    "version": "1.0.0",
    "contact": {
      "name": "Ezmock Team"
    }
  },
  "servers": [
    {
      "url": "https://backend.ezmock.site",
      "description": "生产环境"
    },
    {
      "url": "http://localhost:3001",
      "description": "本地开发"
    }
  ],
  "security": [
    {
      "bearerAuth": []
    }
  ],
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "Supabase Auth JWT Token"
      }
    },
    "schemas": {
      "Error": {
        "type": "object",
        "properties": {
          "error": {
            "type": "string"
          }
        }
      },
      "CreateSessionInput": {
        "type": "object",
        "required": [
          "position",
          "difficulty"
        ],
        "properties": {
          "skillId": {
            "type": "string",
            "maxLength": 50
          },
          "position": {
            "type": "string",
            "maxLength": 100,
            "example": "前端工程师"
          },
          "difficulty": {
            "type": "string",
            "enum": [
              "初级",
              "中级",
              "高级"
            ]
          },
          "jobDescription": {
            "type": "string",
            "maxLength": 2000
          },
          "questionCount": {
            "type": "integer",
            "minimum": 3,
            "maximum": 10,
            "default": 5
          },
          "targetCompany": {
            "type": "string",
            "maxLength": 100
          },
          "modelProvider": {
            "type": "string",
            "enum": [
              "deepseek",
              "openai",
              "anthropic"
            ]
          },
          "modelName": {
            "type": "string",
            "maxLength": 100
          },
          "userApiKey": {
            "type": "string",
            "maxLength": 500
          },
          "resumeText": {
            "type": "string",
            "maxLength": 2000
          },
          "resumeId": {
            "type": "string",
            "format": "uuid"
          }
        }
      },
      "SessionItem": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "position": {
            "type": "string"
          },
          "difficulty": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "in_progress",
              "completed"
            ]
          },
          "overall_score": {
            "type": "integer",
            "nullable": true
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "interview_mode": {
            "type": "string",
            "enum": [
              "text",
              "voice"
            ]
          }
        }
      },
      "SkillMeta": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "categories": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "key": {
                  "type": "string"
                },
                "label": {
                  "type": "string"
                },
                "priority": {
                  "type": "string",
                  "enum": [
                    "CORE",
                    "NORMAL",
                    "ALWAYS_ONE"
                  ]
                }
              }
            }
          }
        }
      },
      "BankQuestion": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "question": {
            "type": "string"
          },
          "position": {
            "type": "string"
          },
          "difficulty": {
            "type": "string"
          },
          "type": {
            "type": "string"
          },
          "is_favorited": {
            "type": "boolean"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      },
      "Settings": {
        "type": "object",
        "properties": {
          "model_provider": {
            "type": "string",
            "enum": [
              "deepseek",
              "openai",
              "anthropic"
            ]
          },
          "model_name": {
            "type": "string",
            "nullable": true
          },
          "keys": {
            "type": "object",
            "additionalProperties": {
              "type": "object",
              "properties": {
                "set": {
                  "type": "boolean"
                },
                "masked": {
                  "type": "string",
                  "nullable": true
                }
              }
            }
          }
        }
      },
      "UpdateSettingsInput": {
        "type": "object",
        "properties": {
          "model_provider": {
            "type": "string",
            "enum": [
              "deepseek",
              "openai",
              "anthropic"
            ]
          },
          "model_name": {
            "type": "string",
            "nullable": true
          },
          "keys": {
            "type": "object",
            "properties": {
              "deepseek": {
                "type": "string",
                "maxLength": 500
              },
              "openai": {
                "type": "string",
                "maxLength": 500
              },
              "anthropic": {
                "type": "string",
                "maxLength": 500
              }
            }
          }
        }
      },
      "SendMessageInput": {
        "type": "object",
        "required": [
          "content"
        ],
        "properties": {
          "content": {
            "type": "string",
            "minLength": 1,
            "maxLength": 5000
          }
        }
      },
      "VoiceConnectResult": {
        "type": "object",
        "properties": {
          "token": {
            "type": "string"
          },
          "wsUrl": {
            "type": "string",
            "format": "uri"
          },
          "expiresAt": {
            "type": "integer"
          }
        }
      }
    }
  },
  "paths": {
    "/api/health": {
      "get": {
        "tags": [
          "健康检查"
        ],
        "summary": "服务健康检查",
        "security": [],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "ok"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/skills": {
      "get": {
        "tags": [
          "技能 (Skill)"
        ],
        "summary": "获取所有 Skill 列表",
        "security": [],
        "responses": {
          "200": {
            "description": "技能列表",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/SkillMeta"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/sessions": {
      "post": {
        "tags": [
          "面试场次 (Session)"
        ],
        "summary": "创建新面试场次",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateSessionInput"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "sessionId": {
                      "type": "string",
                      "format": "uuid"
                    }
                  }
                }
              }
            }
          },
          "401": {
            "description": "认证失败",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      },
      "get": {
        "tags": [
          "面试场次 (Session)"
        ],
        "summary": "获取当前用户所有面试场次",
        "responses": {
          "200": {
            "description": "场次列表",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/SessionItem"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/sessions/{id}": {
      "get": {
        "tags": [
          "面试场次 (Session)"
        ],
        "summary": "获取单个面试场次详情（含所有题目）",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "场次详情"
          },
          "404": {
            "description": "资源不存在",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/api/sessions/{id}/finish": {
      "post": {
        "tags": [
          "面试场次 (Session)"
        ],
        "summary": "结束面试场次并生成综合评价",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "overallScore": {
                      "type": "integer"
                    },
                    "overallFeedback": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/questions/{questionId}/message": {
      "post": {
        "tags": [
          "题目 (Question)"
        ],
        "summary": "发送回答消息",
        "parameters": [
          {
            "name": "questionId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/SendMessageInput"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "消息发送成功"
          },
          "404": {
            "description": "资源不存在",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/api/questions/{questionId}/evaluate": {
      "post": {
        "tags": [
          "题目 (Question)"
        ],
        "summary": "评价单题对话",
        "parameters": [
          {
            "name": "questionId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "评价结果"
          },
          "404": {
            "description": "资源不存在",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/api/bank": {
      "get": {
        "tags": [
          "题库 (Bank)"
        ],
        "summary": "列出公共题库题目",
        "parameters": [
          {
            "name": "position",
            "in": "query",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "difficulty",
            "in": "query",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "type",
            "in": "query",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "search",
            "in": "query",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "题目列表",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/BankQuestion"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/bank/favorites": {
      "get": {
        "tags": [
          "题库 (Bank)"
        ],
        "summary": "获取当前用户收藏的题目",
        "responses": {
          "200": {
            "description": "收藏列表",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/BankQuestion"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/bank/{id}": {
      "get": {
        "tags": [
          "题库 (Bank)"
        ],
        "summary": "获取单个题库题目详情",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "题目详情"
          },
          "404": {
            "description": "资源不存在",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/api/bank/{id}/favorite": {
      "post": {
        "tags": [
          "题库 (Bank)"
        ],
        "summary": "切换题目收藏状态",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "收藏状态已更新"
          }
        }
      }
    },
    "/api/settings": {
      "get": {
        "tags": [
          "设置 (Settings)"
        ],
        "summary": "获取当前用户设置",
        "responses": {
          "200": {
            "description": "用户设置",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Settings"
                }
              }
            }
          }
        }
      },
      "put": {
        "tags": [
          "设置 (Settings)"
        ],
        "summary": "更新当前用户设置",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/UpdateSettingsInput"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "设置已保存"
          }
        }
      }
    },
    "/api/resumes": {
      "post": {
        "tags": [
          "简历 (Resume)"
        ],
        "summary": "上传并解析简历文件",
        "requestBody": {
          "required": true,
          "content": {
            "multipart/form-data": {
              "schema": {
                "type": "object",
                "properties": {
                  "file": {
                    "type": "string",
                    "format": "binary"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "解析结果"
          },
          "400": {
            "description": "上传失败",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      },
      "get": {
        "tags": [
          "简历 (Resume)"
        ],
        "summary": "获取当前用户所有简历",
        "responses": {
          "200": {
            "description": "简历列表"
          }
        }
      }
    },
    "/api/resumes/{id}": {
      "get": {
        "tags": [
          "简历 (Resume)"
        ],
        "summary": "获取单个简历详情",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "简历详情"
          },
          "404": {
            "description": "资源不存在",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "简历 (Resume)"
        ],
        "summary": "删除简历",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "删除成功"
          }
        }
      }
    },
    "/api/voice/sessions": {
      "post": {
        "tags": [
          "语音面试 (Voice)"
        ],
        "summary": "创建语音面试场次",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateSessionInput"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "创建成功"
          }
        }
      }
    },
    "/api/voice/sessions/{sessionId}": {
      "get": {
        "tags": [
          "语音面试 (Voice)"
        ],
        "summary": "获取语音面试场次详情",
        "parameters": [
          {
            "name": "sessionId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "场次详情"
          }
        }
      }
    },
    "/api/voice/sessions/{sessionId}/connect": {
      "post": {
        "tags": [
          "语音面试 (Voice)"
        ],
        "summary": "获取 WebSocket 连接信息",
        "parameters": [
          {
            "name": "sessionId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "连接信息",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/VoiceConnectResult"
                }
              }
            }
          }
        }
      }
    },
    "/api/voice/sessions/{sessionId}/messages": {
      "get": {
        "tags": [
          "语音面试 (Voice)"
        ],
        "summary": "获取语音面试消息列表",
        "parameters": [
          {
            "name": "sessionId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "消息列表"
          }
        }
      }
    },
    "/api/voice/sessions/{sessionId}/end": {
      "post": {
        "tags": [
          "语音面试 (Voice)"
        ],
        "summary": "结束语音面试并生成评价",
        "parameters": [
          {
            "name": "sessionId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "结束成功"
          }
        }
      }
    }
  }
};

/** OpenAPI 文档类型 */
export type OpenApiDocument = typeof OPENAPI_DOC;
