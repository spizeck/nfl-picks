"use client";

import { useEffect, useState } from "react";
import HomeClient from "./home-client";

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  if (!mounted) {
    return <div>Loading...</div>;
  }

  return <HomeClient />;
}
