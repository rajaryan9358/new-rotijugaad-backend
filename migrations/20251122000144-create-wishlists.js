'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('wishlists'); }catch{}
    if(!c){
      await q.createTable('wishlists',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        employee_id:{ type:S.INTEGER, allowNull:false },
        job_id:{ type:S.INTEGER, allowNull:false },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') }
      });
    }
  },
  async down(q){ try{ await q.dropTable('wishlists'); }catch{} }
};
