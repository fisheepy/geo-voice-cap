import type { AvatarAction, AvatarEmotion } from "./types";

export type AvatarReaction = {
  action: AvatarAction;
  emotion: AvatarEmotion;
};

const celebration = /恭喜|太好了|真棒|好厉害|做到了|成功了|值得庆祝|为你高兴|了不起|骄傲/;
const concern = /辛苦|难受|难过|心疼|不容易|委屈|疲惫|累坏|抱歉|遗憾|别急|慢慢来|陪着你|我在听/;
const surprise = /没想到|居然|竟然|真的吗|原来如此|哇|天啊/;
const greeting = /^(你好|嗨|早上好|中午好|下午好|晚上好|很高兴见到你)/;
const reflection = /我理解|我明白|听起来|也许|可能|我想想|不妨|可以试试|建议|先把|一步一步|梳理/;
const reassurance = /没关系|没问题|可以的|来得及|不用着急|已经很好|会陪你|值得被|你不是一个人/;

export function deriveAvatarReaction(rawText: string): AvatarReaction {
  const text = rawText.trim().replace(/\s+/g, "");
  if (!text) return { action: "talk", emotion: "neutral" };
  if (celebration.test(text)) return { action: "celebrate", emotion: "excited" };
  if (concern.test(text)) return { action: "comfort", emotion: "concerned" };
  if (surprise.test(text)) return { action: "nod", emotion: "surprised" };
  if (greeting.test(text)) return { action: "wave", emotion: "happy" };
  if (reassurance.test(text)) return { action: "nod", emotion: "happy" };
  if (reflection.test(text) || /[？?]$/.test(text)) return { action: "explain", emotion: "thoughtful" };
  return { action: "talk", emotion: "happy" };
}
