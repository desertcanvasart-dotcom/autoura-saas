# WhatsApp follow-up templates

WhatsApp lets a business type a free message only within **24 hours** of the customer's last message. After that, Twilio refuses it (error **63016**), and only an **approved template** is delivered. Once the customer replies, normal messages work again for another 24 hours.

Autoura sends a company's follow-up template from the inbox ("Send follow-up") when a client's 24 hours have passed. Each company keeps its own, one per language, in **Settings → WhatsApp → Follow-up templates** (stored in `tenants.settings.whatsapp_templates.follow_up`; see `lib/whatsapp-templates.ts`).

## Setting one up

1. In Twilio, **Messaging → Content Template Builder → Create**. Type: **Text**. Pick a name and language.
2. Paste the text. Submit it for **WhatsApp approval** (category: **Utility**). Meta may reclassify a follow-up as **Marketing**; it still works.
3. When Twilio shows **Approved**, copy the template's ID (`HX…`) into Settings → WhatsApp for that language. Autoura checks the ID with Twilio and keeps the approved text.

A template may use `{{1}}` for the client's first name. Autoura then refuses to send it to a conversation with no client name, because WhatsApp refuses an empty variable. The drafts below have no variables, so they always send.

## Drafts for Travel2Egypt (awaiting the owner's approval, 19 Nov 2026)

| Name | Language | Text |
|---|---|---|
| `t2e_follow_up_en` | English | Hello from Travel2Egypt. We're following up on your Egypt trip enquiry. Reply to this message and we'll continue our conversation here. |
| `t2e_follow_up_es` | Spanish | Hola, te escribimos de Travel2Egypt para dar seguimiento a tu consulta sobre el viaje a Egipto. Responde a este mensaje y seguimos la conversación por aquí. |
| `t2e_follow_up_ja` | Japanese | Travel2Egyptです。エジプト旅行のお問い合わせについてご連絡いたしました。このメッセージにご返信いただければ、こちらでやり取りを続けさせていただきます。 |

Each template message carries Meta's per-message fee for its category.

## Limits

- Twilio only. On the Meta Cloud API connection (`WHATSAPP_PROVIDER=meta`), templates are sent by name; that path is not built yet, and the inbox says so.
- The inbox decides "24 hours passed" from the last message the client sent on that conversation, as Autoura received it.
