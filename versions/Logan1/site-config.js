/**
 * Site deployment settings — edit when hosting on martinimortgagegroup.com.
 * Calculator API must be served from the same path (python3 server.py).
 */
window.MMG_SITE = {
  brandName: "Martini Mortgage Group",
  siteUrl: "https://martinimortgagegroup.com",
  calculatorPath: "/mortgage-calculator/",
  applyUrl: "https://applywithlogan.com",
  calendlyUrl: "https://calendly.com/kevinmartini/private-call-with-martini",
  phone: "9192384934",
  phoneDisplay: "(919) 238-4934",
  strategistName: "Logan Martini",
  nmls: "1591485",
  /** Default campaign tag when no ?ref= or UTM is present */
  defaultCampaign: "mmg-calculator",
  /** Open Graph / share image (absolute URL on your CDN or site) */
  shareImage: "https://martinimortgagegroup.com/wp-content/uploads/mmg-calculator-share.jpg",
};