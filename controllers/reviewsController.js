const { Op } = require('sequelize');
const Review = require('../models/Review');
const Employee = require('../models/Employee');
const Employer = require('../models/Employer');

const deriveName = (entity) => {
  if (!entity) return '-';
  const full =
    entity.name ||
    entity.full_name ||
    entity.business_name ||
    entity.company_name ||
    [entity.first_name, entity.last_name].filter(Boolean).join(' ');
  return full?.trim() || '-';
};

const withReviewerNames = async (reviews) =>
  Promise.all(
    reviews.map(async (review) => {
      const json = review.toJSON();
      const source =
        review.user_type === 'employee'
          ? await Employee.findByPk(review.user_id)
          : await Employer.findByPk(review.user_id);
      json.reviewer_name = deriveName(source);
      return json;
    })
  );

exports.listReviews = async (req, res) => {
  try {
    const { user_type, rating, is_read } = req.query;
    const where = {};
    if (user_type) where.user_type = user_type;
    if (rating) where.rating = Number(rating);
    if (typeof is_read !== 'undefined') {
      const wantRead = is_read === true || is_read === 'true';
      where.read_at = wantRead ? { [Op.not]: null } : { [Op.is]: null };
    }

    const reviews = await Review.findAll({
      where,
      order: [['updated_at', 'DESC']],
    });

    res.json({ success: true, data: await withReviewerNames(reviews) });
  } catch (error) {
    console.error('[reviews:list]', error);
    res.status(500).json({ success: false, message: 'Unable to fetch reviews' });
  }
};

exports.markReviewRead = async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    if (!review.read_at) {
      review.read_at = new Date();
      await review.save();
    }
    res.json({ success: true, data: review });
  } catch (error) {
    console.error('[reviews:markRead]', error);
    res.status(500).json({ success: false, message: 'Unable to update review' });
  }
};
