'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('job_shifts'); }catch{}
    if(!c){
      await q.createTable('job_shifts',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        job_id:{ type:S.INTEGER, allowNull:false },
        shift_id:{ type:S.INTEGER, allowNull:false },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') }
      });
    }
  },
  async down(q){ try{ await q.dropTable('job_shifts'); }catch{} }
};
