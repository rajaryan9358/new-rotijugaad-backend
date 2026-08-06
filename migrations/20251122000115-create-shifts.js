'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('shifts'); }catch{}
    if(!c){
      await q.createTable('shifts',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        shift_english:{ type:S.STRING, allowNull:false },
        shift_hindi:{ type:S.STRING, allowNull:false },
        shift_from:{ type:S.TIME, allowNull:false },
        shift_to:{ type:S.TIME, allowNull:false },
        sequence:{ type:S.INTEGER },
        is_active:{ type:S.BOOLEAN, defaultValue:true },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('shifts'); }catch{} }
};
