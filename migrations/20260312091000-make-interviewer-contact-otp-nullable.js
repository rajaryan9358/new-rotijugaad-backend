'use strict';
module.exports = {
  async up(q,S){
    try{
      await q.changeColumn('interviewer_contact_otps', 'otp', {
        type: S.STRING(10),
        allowNull: true,
      });
    }catch(e){}
  },

  async down(q,S){
    try{
      await q.sequelize.query("UPDATE interviewer_contact_otps SET otp = '' WHERE otp IS NULL");
    }catch(e){}

    try{
      await q.changeColumn('interviewer_contact_otps', 'otp', {
        type: S.STRING(10),
        allowNull: false,
      });
    }catch(e){}
  }
};
