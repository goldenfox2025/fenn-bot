import { FoxAvatar } from "@fenn-ui/components/FoxAvatar";
export function BotFace({
  size = 24,
  className = "",
  animated = false,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  return (
    <FoxAvatar variant="assistant" animated={animated} size={size} className={"bot-face " + className} />
  );
}
