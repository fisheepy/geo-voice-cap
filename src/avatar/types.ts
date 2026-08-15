export type AvatarAction =
  | "idle"
  | "listening"
  | "thinking"
  | "talk"
  | "explain"
  | "comfort"
  | "wave"
  | "nod"
  | "shakeHead"
  | "celebrate";

export type AvatarEmotion = "neutral" | "happy" | "thoughtful" | "excited" | "concerned" | "surprised";

export type AvatarCommand = {
  action: AvatarAction;
  emotion: AvatarEmotion;
  speaking: boolean;
  nonce: number;
};
