import { useEffect } from "react";

const useScript = (
  url: string,
  onload: ((this: GlobalEventHandlers, ev: Event) => any) | null = null
) => {
  useEffect(() => {
    const script = document.createElement("script");

    script.async = true;
    script.onload = onload;
    script.src = url;

    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [url]);
};

export default useScript;
