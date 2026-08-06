'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const expiryAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const withTimestamps = (row, { updated = true } = {}) => (
      updated ? { ...row, created_at: now, updated_at: now } : { ...row, created_at: now }
    );

    const insertIfMissing = async (table, uniqueColumn, rows) => {
      for (const row of rows) {
        const existing = await queryInterface.sequelize.query(
          `SELECT id FROM \`${table}\` WHERE \`${uniqueColumn}\` = :value LIMIT 1`,
          {
            replacements: { value: row[uniqueColumn] },
            type: Sequelize.QueryTypes.SELECT,
          },
        );

        if (!existing.length) {
          await queryInterface.bulkInsert(table, [row]);
        }
      }
    };

    const getIdBy = async (table, column, value) => {
      const rows = await queryInterface.sequelize.query(
        `SELECT id FROM \`${table}\` WHERE \`${column}\` = :value LIMIT 1`,
        {
          replacements: { value },
          type: Sequelize.QueryTypes.SELECT,
        },
      );
      return rows[0]?.id ?? null;
    };

    await insertIfMissing('roles', 'slug', [
      withTimestamps({
        name: 'Admin',
        slug: 'admin',
        permissions: JSON.stringify(['dashboard.view', 'users.view', 'employees.view', 'employers.view', 'jobs.view']),
      }),
    ]);

    await insertIfMissing('business_categories', 'category_english', [
      withTimestamps({ category_english: 'Restaurants & Cafes', category_hindi: 'रेस्टोरेंट और कैफे', sequence: 1, is_active: true }),
      withTimestamps({ category_english: 'Retail & Stores', category_hindi: 'रिटेल और स्टोर्स', sequence: 2, is_active: true }),
      withTimestamps({ category_english: 'Logistics & Delivery', category_hindi: 'लॉजिस्टिक्स और डिलीवरी', sequence: 3, is_active: true }),
      withTimestamps({ category_english: 'Hospitality', category_hindi: 'आतिथ्य', sequence: 4, is_active: true }),
    ]);

    await insertIfMissing('states', 'state_english', [
      withTimestamps({ state_english: 'Maharashtra', state_hindi: 'महाराष्ट्र', sequence: 1, is_active: true }, { updated: false }),
      withTimestamps({ state_english: 'Delhi', state_hindi: 'दिल्ली', sequence: 2, is_active: true }, { updated: false }),
      withTimestamps({ state_english: 'Karnataka', state_hindi: 'कर्नाटक', sequence: 3, is_active: true }, { updated: false }),
      withTimestamps({ state_english: 'Gujarat', state_hindi: 'गुजरात', sequence: 4, is_active: true }, { updated: false }),
    ]);

    const maharashtraId = await getIdBy('states', 'state_english', 'Maharashtra');
    const delhiId = await getIdBy('states', 'state_english', 'Delhi');
    const karnatakaId = await getIdBy('states', 'state_english', 'Karnataka');
    const gujaratId = await getIdBy('states', 'state_english', 'Gujarat');

    await insertIfMissing('cities', 'city_english', [
      withTimestamps({ state_id: maharashtraId, city_english: 'Mumbai', city_hindi: 'मुंबई', sequence: 1, is_active: true }, { updated: false }),
      withTimestamps({ state_id: maharashtraId, city_english: 'Pune', city_hindi: 'पुणे', sequence: 2, is_active: true }, { updated: false }),
      withTimestamps({ state_id: delhiId, city_english: 'New Delhi', city_hindi: 'नई दिल्ली', sequence: 3, is_active: true }, { updated: false }),
      withTimestamps({ state_id: delhiId, city_english: 'Dwarka', city_hindi: 'द्वारका', sequence: 4, is_active: true }, { updated: false }),
      withTimestamps({ state_id: karnatakaId, city_english: 'Bengaluru', city_hindi: 'बेंगलुरु', sequence: 5, is_active: true }, { updated: false }),
      withTimestamps({ state_id: karnatakaId, city_english: 'Mysuru', city_hindi: 'मैसूर', sequence: 6, is_active: true }, { updated: false }),
      withTimestamps({ state_id: gujaratId, city_english: 'Ahmedabad', city_hindi: 'अहमदाबाद', sequence: 7, is_active: true }, { updated: false }),
      withTimestamps({ state_id: gujaratId, city_english: 'Surat', city_hindi: 'सूरत', sequence: 8, is_active: true }, { updated: false }),
    ]);

    await insertIfMissing('distances', 'title_english', [
      withTimestamps({ title_english: 'Within 5 km', title_hindi: '5 किमी के भीतर', distance: 5, sequence: 1, is_active: true }),
      withTimestamps({ title_english: 'Within 10 km', title_hindi: '10 किमी के भीतर', distance: 10, sequence: 2, is_active: true }),
      withTimestamps({ title_english: 'Within 20 km', title_hindi: '20 किमी के भीतर', distance: 20, sequence: 3, is_active: true }),
      withTimestamps({ title_english: 'Anywhere in city', title_hindi: 'शहर में कहीं भी', distance: 50, sequence: 4, is_active: true }),
    ]);

    await insertIfMissing('document_types', 'type_english', [
      withTimestamps({ type_english: 'Aadhaar Card', type_hindi: 'आधार कार्ड', sequence: 1, is_active: true }),
      withTimestamps({ type_english: 'PAN Card', type_hindi: 'पैन कार्ड', sequence: 2, is_active: true }),
      withTimestamps({ type_english: 'Resume', type_hindi: 'रिज्यूमे', sequence: 3, is_active: true }),
      withTimestamps({ type_english: 'Experience Letter', type_hindi: 'अनुभव पत्र', sequence: 4, is_active: true }),
    ]);

    await insertIfMissing('employee_call_experiences', 'experience_english', [
      withTimestamps({ experience_english: 'Interested and responsive', experience_hindi: 'रुचि है और जवाब दे रहा है', sequence: 1, is_active: true }),
      withTimestamps({ experience_english: 'Not reachable', experience_hindi: 'संपर्क नहीं हो पाया', sequence: 2, is_active: true }),
      withTimestamps({ experience_english: 'Requested callback later', experience_hindi: 'बाद में कॉल करने को कहा', sequence: 3, is_active: true }),
    ]);

    await insertIfMissing('employee_report_reasons', 'reason_english', [
      withTimestamps({ reason_english: 'Fake job information', reason_hindi: 'नकली नौकरी की जानकारी', sequence: 1, is_active: true }),
      withTimestamps({ reason_english: 'Abusive behavior', reason_hindi: 'अपमानजनक व्यवहार', sequence: 2, is_active: true }),
      withTimestamps({ reason_english: 'Demanding money', reason_hindi: 'पैसे की मांग', sequence: 3, is_active: true }),
    ]);

    await insertIfMissing('employee_subscription_plans', 'plan_name_english', [
      withTimestamps({ plan_name_english: 'Starter Employee', plan_name_hindi: 'स्टार्टर कर्मचारी', plan_validity_days: 30, plan_tagline_english: 'Basic contact unlocks for job seekers', plan_tagline_hindi: 'नौकरी खोजने वालों के लिए बेसिक कॉन्टैक्ट अनलॉक', plan_price: 99, contact_credits: 10, interest_credits: 5, sequence: 1, is_active: true }),
      withTimestamps({ plan_name_english: 'Growth Employee', plan_name_hindi: 'ग्रोथ कर्मचारी', plan_validity_days: 60, plan_tagline_english: 'More visibility and more interest credits', plan_tagline_hindi: 'अधिक दृश्यता और अधिक इंटरेस्ट क्रेडिट', plan_price: 199, contact_credits: 25, interest_credits: 15, sequence: 2, is_active: true }),
      withTimestamps({ plan_name_english: 'Pro Employee', plan_name_hindi: 'प्रो कर्मचारी', plan_validity_days: 90, plan_tagline_english: 'Maximum job reach and unlock limits', plan_tagline_hindi: 'अधिकतम जॉब पहुंच और अनलॉक लिमिट', plan_price: 349, contact_credits: 50, interest_credits: 30, sequence: 3, is_active: true }),
    ]);

    await insertIfMissing('employer_call_experiences', 'experience_english', [
      withTimestamps({ experience_english: 'Candidate shortlisted', experience_hindi: 'उम्मीदवार शॉर्टलिस्ट किया गया', sequence: 1, is_active: true }),
      withTimestamps({ experience_english: 'Candidate not interested', experience_hindi: 'उम्मीदवार रुचि नहीं रखता', sequence: 2, is_active: true }),
      withTimestamps({ experience_english: 'Interview scheduled', experience_hindi: 'इंटरव्यू तय किया गया', sequence: 3, is_active: true }),
    ]);

    await insertIfMissing('employer_report_reasons', 'reason_english', [
      withTimestamps({ reason_english: 'Fake candidate profile', reason_hindi: 'नकली उम्मीदवार प्रोफाइल', sequence: 1, is_active: true }),
      withTimestamps({ reason_english: 'No-show after confirmation', reason_hindi: 'पुष्टि के बाद उपस्थित नहीं हुआ', sequence: 2, is_active: true }),
      withTimestamps({ reason_english: 'Provided wrong information', reason_hindi: 'गलत जानकारी दी', sequence: 3, is_active: true }),
    ]);

    await insertIfMissing('employer_subscription_plans', 'plan_name_english', [
      withTimestamps({ plan_name_english: 'Basic Hiring', plan_name_hindi: 'बेसिक हायरिंग', plan_validity_days: 30, plan_tagline_english: 'Start posting and unlocking candidates', plan_tagline_hindi: 'जॉब पोस्ट करना और उम्मीदवार अनलॉक करना शुरू करें', plan_price: 499, contact_credits: 20, interest_credits: 10, ad_credits: 2, sequence: 1, is_active: true }),
      withTimestamps({ plan_name_english: 'Smart Hiring', plan_name_hindi: 'स्मार्ट हायरिंग', plan_validity_days: 60, plan_tagline_english: 'Balanced credits for growing teams', plan_tagline_hindi: 'बढ़ती टीमों के लिए संतुलित क्रेडिट', plan_price: 999, contact_credits: 50, interest_credits: 25, ad_credits: 5, sequence: 2, is_active: true }),
      withTimestamps({ plan_name_english: 'Premium Hiring', plan_name_hindi: 'प्रीमियम हायरिंग', plan_validity_days: 90, plan_tagline_english: 'High-volume hiring with maximum reach', plan_tagline_hindi: 'अधिकतम पहुंच के साथ बड़े पैमाने पर हायरिंग', plan_price: 1999, contact_credits: 120, interest_credits: 60, ad_credits: 12, sequence: 3, is_active: true }),
    ]);

    await insertIfMissing('experiences', 'title_english', [
      withTimestamps({ title_english: 'Fresher', title_hindi: 'फ्रेशर', exp_from: 0, exp_to: 1, exp_type: 'year', sequence: 1, is_active: true }),
      withTimestamps({ title_english: '1 to 3 years', title_hindi: '1 से 3 वर्ष', exp_from: 1, exp_to: 3, exp_type: 'year', sequence: 2, is_active: true }),
      withTimestamps({ title_english: '3 to 5 years', title_hindi: '3 से 5 वर्ष', exp_from: 3, exp_to: 5, exp_type: 'year', sequence: 3, is_active: true }),
      withTimestamps({ title_english: '5+ years', title_hindi: '5+ वर्ष', exp_from: 5, exp_to: 10, exp_type: 'year', sequence: 4, is_active: true }),
    ]);

    await insertIfMissing('job_benefits', 'benefit_english', [
      withTimestamps({ benefit_english: 'PF Benefit', benefit_hindi: 'पीएफ लाभ', sequence: 1, is_active: true }),
      withTimestamps({ benefit_english: 'ESI Coverage', benefit_hindi: 'ईएसआई कवरेज', sequence: 2, is_active: true }),
      withTimestamps({ benefit_english: 'Free Meals', benefit_hindi: 'मुफ्त भोजन', sequence: 3, is_active: true }),
      withTimestamps({ benefit_english: 'Accommodation', benefit_hindi: 'आवास', sequence: 4, is_active: true }),
      withTimestamps({ benefit_english: 'Weekly Off', benefit_hindi: 'साप्ताहिक अवकाश', sequence: 5, is_active: true }),
    ]);

    await insertIfMissing('job_profiles', 'profile_english', [
      withTimestamps({ profile_english: 'Delivery Executive', profile_hindi: 'डिलीवरी एग्जीक्यूटिव', profile_image: null, sequence: 1, is_active: true }),
      withTimestamps({ profile_english: 'Kitchen Helper', profile_hindi: 'किचन हेल्पर', profile_image: null, sequence: 2, is_active: true }),
      withTimestamps({ profile_english: 'Waiter', profile_hindi: 'वेटर', profile_image: null, sequence: 3, is_active: true }),
      withTimestamps({ profile_english: 'Housekeeping Staff', profile_hindi: 'हाउसकीपिंग स्टाफ', profile_image: null, sequence: 4, is_active: true }),
      withTimestamps({ profile_english: 'Telecaller', profile_hindi: 'टेलीकॉलर', profile_image: null, sequence: 5, is_active: true }),
      withTimestamps({ profile_english: 'Receptionist', profile_hindi: 'रिसेप्शनिस्ट', profile_image: null, sequence: 6, is_active: true }),
    ]);

    await insertIfMissing('qualifications', 'qualification_english', [
      withTimestamps({ qualification_english: '10th Pass', qualification_hindi: '10वीं पास', sequence: 1, is_active: true }),
      withTimestamps({ qualification_english: '12th Pass', qualification_hindi: '12वीं पास', sequence: 2, is_active: true }),
      withTimestamps({ qualification_english: 'Diploma', qualification_hindi: 'डिप्लोमा', sequence: 3, is_active: true }),
      withTimestamps({ qualification_english: 'Graduate', qualification_hindi: 'स्नातक', sequence: 4, is_active: true }),
    ]);

    await insertIfMissing('salary_ranges', 'salary_from', [
      withTimestamps({ salary_from: 10000, salary_to: 15000, is_active: true }),
      withTimestamps({ salary_from: 15001, salary_to: 20000, is_active: true }),
      withTimestamps({ salary_from: 20001, salary_to: 30000, is_active: true }),
      withTimestamps({ salary_from: 30001, salary_to: 50000, is_active: true }),
    ]);

    await insertIfMissing('salary_types', 'type_english', [
      withTimestamps({ type_english: 'Monthly', type_hindi: 'मासिक', sequence: 1, is_active: true }),
      withTimestamps({ type_english: 'Weekly', type_hindi: 'साप्ताहिक', sequence: 2, is_active: true }),
      withTimestamps({ type_english: 'Daily', type_hindi: 'दैनिक', sequence: 3, is_active: true }),
    ]);

    await insertIfMissing('shifts', 'shift_english', [
      withTimestamps({ shift_english: 'Day Shift', shift_hindi: 'दिन की शिफ्ट', shift_from: '09:00:00', shift_to: '18:00:00', sequence: 1, is_active: true }),
      withTimestamps({ shift_english: 'Night Shift', shift_hindi: 'रात की शिफ्ट', shift_from: '21:00:00', shift_to: '06:00:00', sequence: 2, is_active: true }),
      withTimestamps({ shift_english: 'Rotational Shift', shift_hindi: 'रोटेशनल शिफ्ट', shift_from: '00:00:00', shift_to: '23:59:00', sequence: 3, is_active: true }),
    ]);

    await insertIfMissing('skills', 'skill_english', [
      withTimestamps({ skill_english: 'Communication', skill_hindi: 'संचार', sequence: 1, is_active: true }),
      withTimestamps({ skill_english: 'Cooking', skill_hindi: 'खाना बनाना', sequence: 2, is_active: true }),
      withTimestamps({ skill_english: 'Cleaning', skill_hindi: 'सफाई', sequence: 3, is_active: true }),
      withTimestamps({ skill_english: 'Driving', skill_hindi: 'ड्राइविंग', sequence: 4, is_active: true }),
      withTimestamps({ skill_english: 'Computer Basics', skill_hindi: 'कंप्यूटर की मूल बातें', sequence: 5, is_active: true }),
      withTimestamps({ skill_english: 'Sales', skill_hindi: 'सेल्स', sequence: 6, is_active: true }),
    ]);

    await insertIfMissing('stories', 'title_english', [
      withTimestamps({ user_type: 'employee', title_english: 'Get Ready for Walk-in Interviews', title_hindi: 'वॉक-इन इंटरव्यू के लिए तैयार रहें', description_english: 'Keep your documents and resume handy to respond faster to nearby job opportunities.', description_hindi: 'आस-पास की नौकरी के अवसरों पर जल्दी प्रतिक्रिया देने के लिए अपने दस्तावेज़ और रिज्यूमे तैयार रखें।', image: null, expiry_at: expiryAt, sequence: 1, is_active: true }),
      withTimestamps({ user_type: 'employee', title_english: 'Improve Your Profile Score', title_hindi: 'अपनी प्रोफाइल स्कोर सुधारें', description_english: 'Add experience, skills and documents to attract more employers.', description_hindi: 'अधिक नियोक्ताओं को आकर्षित करने के लिए अनुभव, कौशल और दस्तावेज़ जोड़ें।', image: null, expiry_at: expiryAt, sequence: 2, is_active: true }),
      withTimestamps({ user_type: 'employer', title_english: 'Hire Faster with Shortlists', title_hindi: 'शॉर्टलिस्ट के साथ तेजी से भर्ती करें', description_english: 'Shortlist relevant candidates and follow up quickly to close positions sooner.', description_hindi: 'उपयुक्त उम्मीदवारों को शॉर्टलिस्ट करें और तेजी से फॉलो-अप करके पद जल्दी भरें।', image: null, expiry_at: expiryAt, sequence: 3, is_active: true }),
      withTimestamps({ user_type: 'employer', title_english: 'Boost Reach with Better Benefits', title_hindi: 'बेहतर लाभों से पहुंच बढ़ाएं', description_english: 'Jobs with meals, stay and weekly off usually perform better.', description_hindi: 'भोजन, आवास और साप्ताहिक अवकाश वाली नौकरियां आम तौर पर बेहतर प्रदर्शन करती हैं।', image: null, expiry_at: expiryAt, sequence: 4, is_active: true }),
    ]);

    await insertIfMissing('vacancy_numbers', 'number_english', [
      withTimestamps({ number_english: '1 Opening', number_hindi: '1 रिक्ति', sequence: 1, is_active: true }),
      withTimestamps({ number_english: '2 to 5 Openings', number_hindi: '2 से 5 रिक्तियां', sequence: 2, is_active: true }),
      withTimestamps({ number_english: '6 to 10 Openings', number_hindi: '6 से 10 रिक्तियां', sequence: 3, is_active: true }),
      withTimestamps({ number_english: '10+ Openings', number_hindi: '10+ रिक्तियां', sequence: 4, is_active: true }),
    ]);

    await insertIfMissing('work_natures', 'nature_english', [
      withTimestamps({ nature_english: 'Full Time', nature_hindi: 'फुल टाइम', sequence: 1, is_active: true }),
      withTimestamps({ nature_english: 'Part Time', nature_hindi: 'पार्ट टाइम', sequence: 2, is_active: true }),
      withTimestamps({ nature_english: 'Contract', nature_hindi: 'कॉन्ट्रैक्ट', sequence: 3, is_active: true }),
      withTimestamps({ nature_english: 'Internship', nature_hindi: 'इंटर्नशिप', sequence: 4, is_active: true }),
    ]);

    const starterEmployeeId = await getIdBy('employee_subscription_plans', 'plan_name_english', 'Starter Employee');
    const growthEmployeeId = await getIdBy('employee_subscription_plans', 'plan_name_english', 'Growth Employee');
    const basicEmployerId = await getIdBy('employer_subscription_plans', 'plan_name_english', 'Basic Hiring');
    const premiumEmployerId = await getIdBy('employer_subscription_plans', 'plan_name_english', 'Premium Hiring');

    await insertIfMissing('plan_benefits', 'benefit_english', [
      withTimestamps({ subscription_type: 'employee', plan_id: starterEmployeeId, benefit_english: 'Unlock 10 employer contacts', benefit_hindi: '10 नियोक्ता संपर्क अनलॉक करें', sequence: 1, is_active: true }),
      withTimestamps({ subscription_type: 'employee', plan_id: growthEmployeeId, benefit_english: 'Priority visibility on matches', benefit_hindi: 'मैचेस में प्राथमिक दृश्यता', sequence: 2, is_active: true }),
      withTimestamps({ subscription_type: 'employer', plan_id: basicEmployerId, benefit_english: 'Post 2 active jobs', benefit_hindi: '2 सक्रिय नौकरियां पोस्ट करें', sequence: 3, is_active: true }),
      withTimestamps({ subscription_type: 'employer', plan_id: premiumEmployerId, benefit_english: 'Featured employer badge', benefit_hindi: 'फीचर्ड नियोक्ता बैज', sequence: 4, is_active: true }),
      withTimestamps({ subscription_type: 'employer', plan_id: premiumEmployerId, benefit_english: 'Higher daily candidate unlocks', benefit_hindi: 'अधिक दैनिक उम्मीदवार अनलॉक', sequence: 5, is_active: true }),
    ]);
  },

  async down(queryInterface, Sequelize) {
    const Op = Sequelize.Op;

    await queryInterface.bulkDelete('plan_benefits', {
      benefit_english: {
        [Op.in]: [
          'Unlock 10 employer contacts',
          'Priority visibility on matches',
          'Post 2 active jobs',
          'Featured employer badge',
          'Higher daily candidate unlocks',
        ],
      },
    });

    await queryInterface.bulkDelete('stories', {
      title_english: {
        [Op.in]: [
          'Get Ready for Walk-in Interviews',
          'Improve Your Profile Score',
          'Hire Faster with Shortlists',
          'Boost Reach with Better Benefits',
        ],
      },
    });

    const deleteByField = async (table, field, values) => {
      await queryInterface.bulkDelete(table, {
        [field]: { [Op.in]: values },
      });
    };

    await deleteByField('roles', 'slug', ['admin']);
    await deleteByField('business_categories', 'category_english', ['Restaurants & Cafes', 'Retail & Stores', 'Logistics & Delivery', 'Hospitality']);
    await deleteByField('cities', 'city_english', ['Mumbai', 'Pune', 'New Delhi', 'Dwarka', 'Bengaluru', 'Mysuru', 'Ahmedabad', 'Surat']);
    await deleteByField('distances', 'title_english', ['Within 5 km', 'Within 10 km', 'Within 20 km', 'Anywhere in city']);
    await deleteByField('document_types', 'type_english', ['Aadhaar Card', 'PAN Card', 'Resume', 'Experience Letter']);
    await deleteByField('employee_call_experiences', 'experience_english', ['Interested and responsive', 'Not reachable', 'Requested callback later']);
    await deleteByField('employee_report_reasons', 'reason_english', ['Fake job information', 'Abusive behavior', 'Demanding money']);
    await deleteByField('employee_subscription_plans', 'plan_name_english', ['Starter Employee', 'Growth Employee', 'Pro Employee']);
    await deleteByField('employer_call_experiences', 'experience_english', ['Candidate shortlisted', 'Candidate not interested', 'Interview scheduled']);
    await deleteByField('employer_report_reasons', 'reason_english', ['Fake candidate profile', 'No-show after confirmation', 'Provided wrong information']);
    await deleteByField('employer_subscription_plans', 'plan_name_english', ['Basic Hiring', 'Smart Hiring', 'Premium Hiring']);
    await deleteByField('experiences', 'title_english', ['Fresher', '1 to 3 years', '3 to 5 years', '5+ years']);
    await deleteByField('job_benefits', 'benefit_english', ['PF Benefit', 'ESI Coverage', 'Free Meals', 'Accommodation', 'Weekly Off']);
    await deleteByField('job_profiles', 'profile_english', ['Delivery Executive', 'Kitchen Helper', 'Waiter', 'Housekeeping Staff', 'Telecaller', 'Receptionist']);
    await deleteByField('qualifications', 'qualification_english', ['10th Pass', '12th Pass', 'Diploma', 'Graduate']);
    await queryInterface.bulkDelete('salary_ranges', {
      salary_from: { [Op.in]: [10000, 15001, 20001, 30001] },
    });
    await deleteByField('salary_types', 'type_english', ['Monthly', 'Weekly', 'Daily']);
    await deleteByField('shifts', 'shift_english', ['Day Shift', 'Night Shift', 'Rotational Shift']);
    await deleteByField('skills', 'skill_english', ['Communication', 'Cooking', 'Cleaning', 'Driving', 'Computer Basics', 'Sales']);
    await deleteByField('states', 'state_english', ['Maharashtra', 'Delhi', 'Karnataka', 'Gujarat']);
    await deleteByField('vacancy_numbers', 'number_english', ['1 Opening', '2 to 5 Openings', '6 to 10 Openings', '10+ Openings']);
    await deleteByField('work_natures', 'nature_english', ['Full Time', 'Part Time', 'Contract', 'Internship']);
  },
};
