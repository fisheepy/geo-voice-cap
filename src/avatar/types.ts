export type AvatarAction = "idle" | "wave" | "nod" | "shakeHead" | "talk";
export type AvatarEmotion = "neutral" | "happy" | "sad" | "surprised";

export type AvatarCommand = {
  action: AvatarAction;
  emotion?: AvatarEmotion;
  nonce: number;
};
