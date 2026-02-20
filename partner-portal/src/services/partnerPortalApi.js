import {
  continueWithProvider,
  createCoursePromo,
  deactivateCoursePromo,
  getAuthSession,
  getMyPartnerContext,
  initializeFromHandoff,
  listMyApplications,
  listMyCoursePromos,
  listVouchersForMyCity,
  logout,
  redeemVoucher,
  updateAssociationProfile,
  updateCoursePromo,
  updatePartnerPlan
} from './partnerBridge';

export const partnerPortalApi = {
  initializeFromHandoff,
  getAuthSession,
  continueWithProvider,
  logout,
  getMyPartnerContext,
  listMyApplications,
  listVouchersForMyCity,
  redeemVoucher,
  listMyCoursePromos,
  createCoursePromo,
  updateCoursePromo,
  deactivateCoursePromo,
  updatePartnerPlan,
  updateAssociationProfile
};
