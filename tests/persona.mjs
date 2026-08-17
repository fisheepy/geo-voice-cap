import assert from "node:assert/strict";
import {
  companionReplyFormat,
  createPersonaInstructions,
  normalizeConversationContext,
  normalizePersona,
  parseCompanionReply,
} from "../server/companionPersona.mjs";

assert.equal(normalizePersona("kai"), "Kai");
assert.equal(normalizePersona("米拉"), "Mira");
assert.equal(normalizePersona("unknown"), "Kai");

const context = normalizeConversationContext({
  locale: "zh-CN",
  timeZone: "Asia/Shanghai",
  localTime: "2026-08-14T01:30:00.000Z",
});
assert.equal(context.timeZone, "Asia/Shanghai");

const textInstructions = createPersonaInstructions("Kai", { channel: "text", context });
for (const requirement of ["好朋友", "先共情后建议", "好友边界", "不编造", "最多只能有一个问句", "先纯粹庆祝", "emotion", "action"]) {
  assert.ok(textInstructions.includes(requirement), `Missing persona requirement: ${requirement}`);
}

const realtimeInstructions = createPersonaInstructions("Kai", { channel: "realtime" });
assert.ok(realtimeInstructions.includes("实时语音对话"));
assert.ok(realtimeInstructions.includes("不要输出 JSON"));

assert.deepEqual(parseCompanionReply('{"message":"我在听，你慢慢说。","follow_up":"你想从哪里开始？还有别的吗？","emotion":"thoughtful","action":"nod"}'), {
  text: "我在听，你慢慢说。\n你想从哪里开始？",
  followUp: "你想从哪里开始？",
  emotion: "thoughtful",
  action: "nod",
});
assert.equal(
  parseCompanionReply('{"message":"第一个五公里值得庆祝。","follow_up":"下一步想做什么？","emotion":"excited","action":"celebrate"}').followUp,
  "",
);
assert.equal(
  parseCompanionReply('{"message":"坚持一个月真的很了不起。你现在感觉怎么样，哪里最让你骄傲","follow_up":"","emotion":"excited","action":"celebrate"}').text,
  "坚持一个月真的很了不起。",
);
assert.deepEqual(parseCompanionReply('{"message":"这段时间真的很不容易。","follow_up":"你愿意再说一点吗？","emotion":"concerned","action":"comfort"}'), {
  text: "这段时间真的很不容易。\n你愿意再说一点吗？",
  followUp: "你愿意再说一点吗？",
  emotion: "concerned",
  action: "comfort",
});
assert.throws(() => parseCompanionReply("not-json"));
assert.equal(companionReplyFormat.schema.additionalProperties, false);

console.log("Persona contract test passed: identity, friend boundaries, context, realtime behavior, and structured output.");
