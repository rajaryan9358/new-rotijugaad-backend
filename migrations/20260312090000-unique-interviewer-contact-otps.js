'use strict';
module.exports = {
  async up(q,S){
    // Remove duplicate rows (keep latest id per employer_id + interviewer_contact)
    try{
      await q.sequelize.query(
        'DELETE t1 FROM interviewer_contact_otps t1 ' +
        'INNER JOIN interviewer_contact_otps t2 ' +
        'ON t1.employer_id = t2.employer_id ' +
        'AND t1.interviewer_contact = t2.interviewer_contact ' +
        'AND t1.id < t2.id'
      );
    }catch(e){}

    // Drop existing non-unique composite index (if present)
    try{
      const idxs = await q.showIndex('interviewer_contact_otps');
      const target = (idxs||[]).find(i => {
        const cols = (i.fields||[]).map(f => f.attribute || f.name);
        return cols.length === 2 && cols[0] === 'employer_id' && cols[1] === 'interviewer_contact';
      });
      if(target && target.name && target.unique === false){
        await q.removeIndex('interviewer_contact_otps', target.name);
      }
    }catch(e){}

    // Add unique composite index
    try{
      await q.addIndex('interviewer_contact_otps', ['employer_id','interviewer_contact'], {
        unique: true,
        name: 'uniq_interviewer_contact_otp_employer_mobile'
      });
    }catch(e){}
  },

  async down(q){
    try{ await q.removeIndex('interviewer_contact_otps', 'uniq_interviewer_contact_otp_employer_mobile'); }catch(e){}
    try{ await q.addIndex('interviewer_contact_otps', ['employer_id','interviewer_contact']); }catch(e){}
  }
};
