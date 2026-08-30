import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LoadingSkeleton from './LoadingSkeleton';
import { getAuthSession } from '../services/authSession';
import { getMyProfileVerification } from '../services/profileVerification';

function VerifiedProfileRoute({ children }) {
  const session = getAuthSession();
  const [verification, setVerification] = useState(null);

  useEffect(() => {
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
