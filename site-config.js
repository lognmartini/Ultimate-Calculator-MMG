/**
 * Site deployment settings — edit when hosting on martinimortgagegroup.com.
 * Calculator API must be served from the same path (python3 server.py).
 */
window.MMG_SITE = {
  brandName: "Martini Mortgage Group",
  siteUrl: "https://martinimortgagegroup.com",
  calculatorPath: "/mortgage-calculator/",
  /** Logan3 — step-by-step page for social “click here” posts (Logan-branded) */
  logan3Path: "/mortgage-calculator/go.html",
  /** Logan4 — team / company social wizard (shared by Kevin & Logan) */
  logan4Path: "/mortgage-calculator/go4.html",
  /** Logan5 — ultimate payment calculator (Logan Martini, lead + realtor tool) */
  logan5Path: "/mortgage-calculator/go5.html",
  /** Affordability Calculator — Vonk-style split layout, Martini branded */
  affordabilityPath: "/mortgage-calculator/affordability.html",
  martiniApplyUrl: "https://applywithmartini.com",
  /** Logan1 realtor co-marketing */
  realtorPath: "/mortgage-calculator/realtor.html",
  socialWizardPath: "/mortgage-calculator/go4.html",
  teamSocialWizardPath: "/mortgage-calculator/go4.html",
  applyUrl: "https://applywithlogan.com",
  /** Default team apply when Logan4 has no ?ref= (Kevin = branch manager) */
  teamApplyUrl: "https://lo-sites.goldstarfinancial.com/?lar=kmartini",
  calendlyUrl: "https://calendly.com/kevinmartini/private-call-with-martini",
  phone: "9192384934",
  phoneDisplay: "(919) 238-4934",
  email: "Kevin@MartiniMortgageGroup.com",
  address: "507 N Blount St, Raleigh, NC 27604",
  strategistName: "Logan Martini",
  nmls: "1591485",
  companyNmls: "3446",
  companyLegalName:
    "Martini Mortgage Group at Gold Star Mortgage Financial Group, Corporation",
  loanOfficers: {
    kevin: {
      name: "Kevin Martini",
      title: "Certified Mortgage Advisor",
      nmls: "143962",
      applyUrl: "https://lo-sites.goldstarfinancial.com/?lar=kmartini",
      email: "Kevin@MartiniMortgageGroup.com",
    },
    logan: {
      name: "Logan Martini",
      title: "Senior Mortgage Strategist",
      nmls: "1591485",
      applyUrl: "https://lo-sites.goldstarfinancial.com/?lar=lmartini",
      email: "Logan@MartiniMortgageGroup.com",
    },
  },
  /** Default campaign tag when no ?ref= or UTM is present */
  defaultCampaign: "mmg-calculator",
  defaultSocialCampaign: "mmg-social-steps",
  defaultTeamSocialCampaign: "mmg-team-social",
  teamTagline: "Your Raleigh mortgage team",
  /** Open Graph / share image (absolute URL on your CDN or site) */
  shareImage:
    "https://martinimortgagegroup.com/wp-content/uploads/mmg-calculator-share.jpg",
  teamShareImage:
    "https://martinimortgagegroup.com/wp-content/uploads/2025/10/Kevin-Martini-1024x1024.png",
};