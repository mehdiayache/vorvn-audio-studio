import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="top-center"
      richColors
      closeButton
      visibleToasts={4}
      gap={10}
      offset="1rem"
      mobileOffset="0.75rem"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "oklch(0.19 0.008 43.1 / 98%)",
          "--normal-text": "oklch(0.986 0.002 67.8)",
          "--normal-border": "oklch(1 0 0 / 12%)",
          "--border-radius": "0.75rem",
        } as React.CSSProperties
      }
      toastOptions={{
        duration: 4_000,
        classNames: {
          toast: "studio-toast",
          title: "studio-toast-title",
          description: "studio-toast-description",
          actionButton: "studio-toast-action",
          closeButton: "studio-toast-close",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
