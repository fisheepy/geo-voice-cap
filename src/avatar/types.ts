export type AvatarAction =
  | "idle"
  | "listening"
  | "thinking"
  | "talk"
  | "wave"
  | "nod"
  | "shakeHead"
  | "celebrate";

export type AvatarEmotion = "neutral" | "happy" | "thoughtful" | "excited";

export type AvatarCommand = {
  action: AvatarAction;
  emotion: AvatarEmotion;
  nonce: number;
};
