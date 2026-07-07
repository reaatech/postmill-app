'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import useCookie from 'react-use-cookie';
export const AfterActivate = () => {
  const fetch = useFetch();
  const params = useParams();
  const [showLoader, setShowLoader] = useState(true);
  const run = useRef(false);
  const t = useT();
  const [datafast_visitor_id] = useCookie('datafast_visitor_id');

  const loadCode = useCallback(async () => {
    if (params.code) {
      const { can } = await (
        await fetch(`/auth/activate`, {
          method: 'POST',
          body: JSON.stringify({
            code: params.code,
            datafast_visitor_id,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        })
      ).json();
      if (!can) {
        setShowLoader(false);
      }
    }
  }, [params.code, datafast_visitor_id, fetch]);

  useEffect(() => {
    // Guard against double-invocation in React StrictMode
    if (!run.current) {
      run.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadCode();
    }
  }, [loadCode]);
  return (
    <>
      {showLoader ? (
        <LoadingComponent />
      ) : (
        <>
          This user is already activated,
          <br />
          <Link href="/auth/login" className="underline">
            {t(
              'click_here_to_go_back_to_login',
              'Click here to go back to login'
            )}
          </Link>
        </>
      )}
    </>
  );
};
