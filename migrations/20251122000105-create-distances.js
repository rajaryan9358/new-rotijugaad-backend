'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('distances'); }catch{}
    if(!c){
      await q.createTable('distances',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        title_english:{ type:S.STRING, allowNull:false },
        title_hindi:{ type:S.STRING, allowNull:false },
        distance:{ type:S.DECIMAL(10,2), allowNull:false },
        sequence:{ type:S.INTEGER },
        is_active:{ type:S.BOOLEAN, defaultValue:true },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('distances'); }catch{} }
};
