'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('job_profiles'); }catch{}
    if(!c){
      await q.createTable('job_profiles',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        profile_english:{ type:S.STRING(150) },
        profile_hindi:{ type:S.STRING(150) },
        profile_image:{ type:S.STRING(255) },
        sequence:{ type:S.INTEGER },
        is_active:{ type:S.BOOLEAN, defaultValue:true },
        created_at:{ type:S.DATE },
        updated_at:{ type:S.DATE },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('job_profiles'); }catch{} }
};
