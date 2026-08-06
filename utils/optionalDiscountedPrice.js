function extractMissingColumnName(error) {
  const message = String(
    error?.original?.sqlMessage
      || error?.original?.message
      || error?.parent?.sqlMessage
      || error?.parent?.message
      || error?.message
      || '',
  );

  let match = message.match(/Unknown column\s+'([^']+)'/i);
  if (match) return match[1];

  match = message.match(/column\s+\"([^\"]+)\"\s+.*does not exist/i);
  if (match) return match[1];

  return null;
}

function stripAttribute(attributes, attributeName) {
  if (!Array.isArray(attributes)) return attributes;
  return attributes.filter((attribute) => {
    if (typeof attribute === 'string') return attribute !== attributeName;
    if (Array.isArray(attribute) && attribute[0] === attributeName) return false;
    return true;
  });
}

function buildFallbackOptions(Model, options = {}, attributeName = 'discounted_price') {
  const next = { ...(options || {}) };

  if (Array.isArray(next.attributes)) {
    next.attributes = stripAttribute(next.attributes, attributeName);
  } else {
    next.attributes = Object.keys(Model.rawAttributes || {}).filter(
      (attribute) => attribute !== attributeName,
    );
  }

  return next;
}

async function findAllWithOptionalAttribute(Model, options = {}, attributeName = 'discounted_price') {
  try {
    return await Model.findAll(options);
  } catch (error) {
    if (extractMissingColumnName(error) !== attributeName) throw error;
    return Model.findAll(buildFallbackOptions(Model, options, attributeName));
  }
}

async function findByPkWithOptionalAttribute(Model, id, options = {}, attributeName = 'discounted_price') {
  try {
    return await Model.findByPk(id, options);
  } catch (error) {
    if (extractMissingColumnName(error) !== attributeName) throw error;
    return Model.findByPk(id, buildFallbackOptions(Model, options, attributeName));
  }
}

async function findOneWithOptionalAttribute(Model, options = {}, attributeName = 'discounted_price') {
  try {
    return await Model.findOne(options);
  } catch (error) {
    if (extractMissingColumnName(error) !== attributeName) throw error;
    return Model.findOne(buildFallbackOptions(Model, options, attributeName));
  }
}

async function createWithOptionalAttribute(Model, payload = {}, attributeName = 'discounted_price') {
  try {
    return await Model.create(payload);
  } catch (error) {
    if (extractMissingColumnName(error) !== attributeName) throw error;
    const nextPayload = { ...(payload || {}) };
    delete nextPayload[attributeName];
    return Model.create(nextPayload);
  }
}

async function updateInstanceWithOptionalAttribute(instance, payload = {}, attributeName = 'discounted_price') {
  try {
    return await instance.update(payload);
  } catch (error) {
    if (extractMissingColumnName(error) !== attributeName) throw error;
    const nextPayload = { ...(payload || {}) };
    delete nextPayload[attributeName];
    return instance.update(nextPayload);
  }
}

module.exports = {
  createWithOptionalAttribute,
  extractMissingColumnName,
  findAllWithOptionalAttribute,
  findByPkWithOptionalAttribute,
  findOneWithOptionalAttribute,
  updateInstanceWithOptionalAttribute,
};