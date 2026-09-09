const emptyMarkers = new Set(["", "—", "待核验", "证据不足", "官网简历未列示", "官网未列示"]);

const substantive = (value) => value != null && !emptyMarkers.has(String(value).trim());

export const compactTitle = (profile = {}) => {
  const position = String(profile.currentPosition || "").trim();
  const title = String(profile.formalTitle || "").trim();
  for (const distinctiveTitle of ["讲席教授", "长聘教授", "特聘教授"]) {
    if (position.includes(distinctiveTitle)) return distinctiveTitle;
  }
  if (substantive(title)) return title;
  if (profile.verificationStatus === "身份冲突") return "身份冲突";
  if (profile.verificationStatus === "证据不足") return "证据不足";
  return "待核验";
};

export const compactHonor = (profile = {}) => {
  const values = [
    profile.academician,
    profile.youthScienceFundClassA,
    profile.youthScienceFundClassB,
    profile.overseasExcellentYoungScientists,
    profile.changjiangScholar,
    profile.otherNationalLeadingTalent,
    profile.otherNationalYoungTalent,
    profile.provincialMinisterialTalent,
    profile.institutionalTalent,
  ].filter(substantive);

  if (substantive(profile.otherHonors)) {
    values.push(...String(profile.otherHonors).split(/[；•]/).map((value) => value.trim()).filter(substantive));
  }

  const unique = [...new Set(values)];
  if (unique.length) return unique.join(" • ");
  if (profile.verificationStatus === "已核验职称") return "官网未列示";
  if (profile.verificationStatus === "证据不足") return "证据不足";
  if (profile.verificationStatus === "身份冲突") return "身份冲突";
  return "待核验";
};
