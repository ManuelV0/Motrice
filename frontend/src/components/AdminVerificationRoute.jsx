import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LoadingSkeleton from './LoadingSkeleton';
import { getAuthSession } from '../services/authSession';
import { canReviewProfileVerifications } from '../services/profileVerification';

function AdminVerificationRoute({ children }) {
  const session = getAuthSession();
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    let active = true;
    canReviewProfileVerifications()
      .then((result) => {
        if (active) setAllowed(Boolean(result));
      })
      .catch(() => {
        if (active) setAllowed(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!session.isAuthenticated) return <Navigate to="/login" replace />;
  if (allowed === null) return <LoadingSkeleton rows={5} variant="detail" />;
  if (!allowed) return <Navigate to="/map" replace />;
  return children;
}

export default AdminVerificationRoute;
