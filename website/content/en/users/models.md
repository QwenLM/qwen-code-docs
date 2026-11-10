# Models and providers

Use `/auth` for guided setup and `/model` to choose an available model. Run `qwen --list-models` to inspect models from the terminal. Custom providers can also be defined in [settings](/en/users/settings/).

## Configure a custom endpoint

Export your credential before starting Qwen Code. The following POSIX-shell example uses a placeholder value:

```sh
export MODEL_API_KEY='replace-with-your-key'
```

Add this configuration to your user settings:

```json
{
  "providers": {
    "gateway": {
      "type": "openai-compatible",
      "protocol": "openai",
      "baseUrl": "https://api.example.com/v1",
      "apiKey": "${MODEL_API_KEY}",
      "models": [
        {
          "model": "your-model-id",
          "displayName": "My coding model"
        }
      ]
    }
  },
  "model": {
    "name": "gateway/your-model-id"
  }
}
```

Replace the endpoint and model ID with values supplied by your service. Restart Qwen Code after editing provider definitions. Select the model with `/model`, or override it for one run:

```sh
qwen --model gateway/your-model-id
```

The model key is `<provider-id>/<model-id>`. Provider IDs must start with an alphanumeric character and contain only letters, numbers, periods, underscores, or dashes. `qoder` and `qwen-subscription` are reserved.

## Endpoint and protocol fields

| Field | Meaning |
| --- | --- |
| `type` | Provider family. Use `openai-compatible` for a general custom endpoint; `alibaba` is also supported. |
| `protocol` | API transport: `openai`, `openai-responses`, `anthropic`, or `gemini`. Omitted values use `openai`. |
| `baseUrl` | HTTP or HTTPS base URL, without embedded credentials, a query string, or a fragment. |
| `apiKey` | Credential or an environment variable reference. An unresolved reference is rejected. |
| `authType` | `bearer` (default), `api-key`, or `google-api-key`. Match the endpoint's authentication requirements. |
| `model` | Optional provider-default model ID. Otherwise the first configured model is the default. |
| `models` | Model definitions, each with a required, unique `model` ID. |
| `displayName` | Optional provider label. |

Protocol and authentication header style are independent settings. Choosing a protocol does not verify that the remote server implements every API feature needed by a coding agent.

A generic custom endpoint may use an empty `apiKey` string if it does not require authentication. Alibaba configurations require a nonempty key. Do not put credentials in `baseUrl`.

## Describe model limits

Each model can specify `displayName`, `contextWindow`, `maxOutputTokens`, `maxTokensField`, and `capabilities`. `maxTokensField` accepts `max_tokens` or `max_completion_tokens`.

`capabilities` declares what the model supports: `tools` (default `true`), `vision` (default `false`), `cacheControl`, and `thinking`. `thinking` is an object whose `modes` lists `enabled` and/or `adaptive`; it can also set `preferredMode` and `supportsEffort`. A custom model without `capabilities.thinking` has thinking disabled, so the thinking and reasoning-effort options below have no effect for it.

Generation parameters such as `temperature` or `maxTokens` are not accepted on a model entry. Set them under `model.preferences["<provider>/<model>"]`.

Set limits according to the actual model service. An omitted context window for a custom model uses an estimated fallback; it is not a verified service limit. Declaring a larger context window does not increase the server's capacity.

For example, replace the `models` list above with:

```json
[
  {
    "model": "your-model-id",
    "contextWindow": 65536,
    "maxOutputTokens": 8192,
    "maxTokensField": "max_tokens"
  }
]
```

These numbers are illustrative, not recommended limits for an unspecified model.

## Reasoning and thinking controls

The CLI exposes `--reasoning-effort`, `--thinking`, `--thinking-budget`, `--context-window`, and `--max-output-tokens`. Their effective support depends on the selected model and protocol. Thinking modes are `auto`, `adaptive`, `enabled`, and `disabled`; a fixed thinking budget implies enabled thinking.

Use model-supported values. A flag does not add a capability to a model that lacks it. If a request fails after changing these controls, retry with the model's defaults before changing the endpoint.

## Diagnose a missing model

Check JSON syntax, provider ID, endpoint format, exported credentials, and the model ID. Use the qualified model key when more than one provider offers the same model name. After fixing a provider definition, restart and list models again.

See [Authentication](/en/users/authentication/) for account connections and [Troubleshooting](/en/users/troubleshooting/) for request failures.

