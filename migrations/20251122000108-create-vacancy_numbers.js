'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('vacancy_numbers'); }catch{}
    if(!c){
      await q.createTable('vacancy_numbers',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        number_english:{ type:S.STRING, allowNull:false },
        number_hindi:{ type:S.STRING, allowNull:false },
        sequence:{ type:S.INTEGER },
        is_active:{ type:S.BOOLEAN, defaultValue:true },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('vacancy_numbers'); }catch{} }
};
