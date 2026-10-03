import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LoadingSkeleton from './LoadingSkeleton';
import { getAuthSession } from '../services/authSession';
import {
  getMyProfileVerification,
  PROFILE_VERIFICATION_OPTIONAL_IN_BETA
} from '../services/profileVerification';

function VerifiedProfileRoute({ children }) {
  const session = getAuthSession();
  const [verification, setVerification] = useState(() => (
    PROFILE_VERIFICATION_OPTIONAL_IN_BETA ? { can_use_verified_actions: true } : null
  ));

  useEffect(() => {
    if (PROFILE_VERIFICATION_OPTIONAL_IN_BETA) return undefined;
    let active = true;
    getMyProfileVerification()
      .then((summary) => {
        if (active) setVerification(summary);
      })
      .catch(() => {
        if (active) setVerification({ status: 'unverified', can_use_verified_actions: false });
      });
    return () => {
      active = false;
    };
  }, []);

  if (!session.isAuthenticated) return <Navigate to="/login" replace />;
  if (verification === null) return <LoadingSkeleton rows={5} variant="detail" />;
  if (!verification.can_use_verified_actions) return <Navigate to="/verify-profile" replace />;
  return children;
}

export default VerifiedProfileRoute;
