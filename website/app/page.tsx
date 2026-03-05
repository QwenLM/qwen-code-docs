"use client";

import { useEffect } from "react";

export default function RedirectToQwenCode() {
  useEffect(() => {
    window.location.href = "https://qwen.ai/qwencode";
  }, []);

  return null;
}
