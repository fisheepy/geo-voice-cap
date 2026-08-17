import assert from "node:assert/strict";
import { deriveAvatarReaction } from "../src/avatar/reactions.ts";

assert.deepEqual(deriveAvatarReaction("恭喜你，终于做到了，真的很了不起。"), {
  action: "celebrate",
  emotion: "excited",
});
assert.deepEqual(deriveAvatarReaction("这段时间真的辛苦了，你慢慢说，我在听。"), {
  action: "comfort",
  emotion: "concerned",
});
assert.deepEqual(deriveAvatarReaction("没想到结果会是这样，真的吗？"), {
  action: "nod",
  emotion: "surprised",
});
assert.deepEqual(deriveAvatarReaction("我们可以先把最重要的一件事梳理出来。"), {
  action: "explain",
  emotion: "thoughtful",
});
assert.deepEqual(deriveAvatarReaction("你好，很高兴见到你。"), {
  action: "wave",
  emotion: "happy",
});
assert.deepEqual(deriveAvatarReaction("我觉得这个方向不错。"), {
  action: "talk",
  emotion: "happy",
});

console.log("Avatar reaction test passed: celebration, comfort, surprise, reflection, greeting, and neutral conversation.");
