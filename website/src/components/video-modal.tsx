"use client"

import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"

export const VideoModal = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="rounded-full px-8 h-12 text-base border-border text-foreground hover:bg-accent transition-all">
          <Play className="mr-2 w-4 h-4" /> Watch Demo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px] p-0 bg-black border-none overflow-hidden">
        <div className="aspect-video w-full">
            <video 
                src="https://cloud.video.taobao.com/vod/HLfyppnCHplRV9Qhz2xSqeazHeRzYtG-EYJnHAqtzkQ.mp4" 
                controls 
                autoPlay
                className="w-full h-full object-contain"
            >
                Your browser does not support the video tag.
            </video>
        </div>
      </DialogContent>
    </Dialog>
  )
}
