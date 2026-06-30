import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  "id": "deepseek",
  "displayName": "deepseek",
  "kind": "hub",
  "domains": [
    "ai"
  ],
  "modelCategories": [
    "low-reasoning",
    "high-reasoning",
    "workflow",
    "vision"
  ],
  "mediaCategories": [
    "image-focal-point"
  ],
  "hasModelList": true,
  "modelHints": {
    "low-reasoning": [
      "deepseek-chat",
      "deepseek-v3"
    ],
    "high-reasoning": [
      "deepseek-reasoner",
      "deepseek-r1"
    ],
    "workflow": [
      "deepseek-chat",
      "deepseek-v3"
    ],
    "vision": [
      "deepseek-vl",
      "deepseek-v3"
    ]
  }
};
