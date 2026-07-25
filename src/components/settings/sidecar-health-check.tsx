import { useEffect, useRef, useState } from "react";
import { FaCircleCheck, FaCircleExclamation } from "react-icons/fa6";
import {
  checkSidecarHealth,
  describeHealth,
  HealthResult,
} from "src/lib/sidecar-health";

// "Test connection" for the sharing host. The host is free text and the only
// previous way to discover a bad one was to open a live session and watch it
// fail, so this is the cheap check that answers "is the address right, and is
// the thing at the other end alive?".
export default function SidecarHealthCheck({ host }: { host: string }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<HealthResult | undefined>();
  // A result describes the host it was fetched for; once the field is edited
  // it's stale and saying "Connected" about a different address would be a lie.
  const testedHost = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (testedHost.current !== undefined && testedHost.current !== host)
      setResult(undefined);
  }, [host]);

  const run = async () => {
    setTesting(true);
    setResult(undefined);
    testedHost.current = host;
    setResult(await checkSidecarHealth(host));
    setTesting(false);
  };

  const ok = result?.status === "ok";
  return (
    <div className="column sidecar-health">
      <button
        type="button"
        className="btn-secondary"
        onClick={run}
        disabled={testing || !host.trim()}
        aria-busy={testing}
      >
        {testing ? "Testing…" : "Test connection"}
      </button>
      {result && (
        <p
          className={`row font-small sidecar-health-result ${
            ok ? "text-success" : "text-error"
          }`}
          // Announce the outcome: the button label doesn't change on
          // completion, so a screen reader would otherwise get nothing.
          role="status"
        >
          {ok ? <FaCircleCheck /> : <FaCircleExclamation />}
          <span>{describeHealth(result)}</span>
        </p>
      )}
    </div>
  );
}
