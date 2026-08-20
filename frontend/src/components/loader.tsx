import { cn } from "@/lib/utils"

export function Loader({
  label,
  className,
  size = "md",
}: {
  label?: string
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  const sizeClass = {
    sm: "scale-75",
    md: "",
    lg: "scale-110",
  }[size]

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 text-muted-foreground",
        className
      )}
      role="status"
      aria-label={label ?? "Loading"}
    >
      <div className={cn("loader", sizeClass)}>
        <div className="square" />
        <div className="square" />
        <div className="square" />
        <div className="square" />
        <div className="square" />
        <div className="square" />
        <div className="square" />
        <div className="square" />
        <div className="square" />
      </div>
      {label && <p className="text-sm font-medium">{label}</p>}
    </div>
  )
}
