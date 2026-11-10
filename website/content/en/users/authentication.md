# Authentication

Use `/auth` to connect a model provider. `/connect` and `/login` are aliases. Connection options depend on your account, region, provider credentials, and the running build.

## Choose a connection

| Entry | How to connect |
| --- | --- |
| Qoder | Follow the Qoder account sign-in flow. |
| Qwen Account | Follow the Qwen account subscription sign-in flow. The current dialog requires an active Plus or Pro plan. |
| QwenCloud | Choose the offered Token Plan or standard API-key connection. |
| Alibaba Cloud Model Studio | Choose the offered Coding Plan, Token Plan, or standard API-key connection. |
| Other Providers | Select an available preset and supply that provider's credentials. |
| Custom Provider | Configure a compatible endpoint, protocol, credentials, and model. |

Account sign-in and API-key access are different connection methods. An account subscription does not automatically establish API-key access to a separate endpoint. Availability, prices, quotas, and promotional benefits are determined by the provider; this documentation does not guarantee them.

## Connect and select a model

1. Run `qwen` in your project and enter `/auth`.
2. Choose the connection type and follow its prompts.
3. Complete browser sign-in or supply the requested provider configuration.
4. Open `/model` and select a model available to that connection.
5. Send a small request to verify the connection before starting a longer task.

For an API endpoint that is not listed, use Custom Provider or edit the `providers` setting as described in [Models and providers](/en/users/models/). Store secrets in environment variables rather than committing them to project settings.

## Switch connections

Reopen `/auth` to connect another provider. Use `/model` to switch among the available models. A model selection is separate from the existence of usable credentials: selecting a model does not grant access to it.

Changes to provider definitions require a CLI restart. If a provider is missing after editing its configuration, check its validation errors and restart before retrying.

## Sign out

```text
/logout
```

`/signout` is an alias. The command signs out the currently selected Qoder or Qwen Account connection and clears its selected authentication type. For the selected Qwen subscription connection, its stored provider entry is also removed.

The current model selection can remain after sign-out. If it is no longer available, select another model with `/model` or sign in again.

For other connection types, `/logout` directs you to use `/auth` to switch providers. It does not revoke an API key at the provider or remove every configured connection. Remove an unwanted provider definition from its configuration source, and revoke a compromised key through the provider's own controls.

## When authentication fails

Check which connection and model are selected. A valid account login does not prove that the account has access to the selected model. For API-key connections, check the endpoint, protocol, and exported environment variable in the shell that starts Qwen Code.

Do not include tokens, browser callback URLs containing credentials, or unredacted settings in an issue. See [Troubleshooting](/en/users/troubleshooting/).

