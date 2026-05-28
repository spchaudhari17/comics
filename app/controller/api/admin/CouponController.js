const Coupon = require("../../../models/Coupon");
const stripe = require("../../../../utils/stripe");



// createCoupon

const createCoupon = async (req, res) => {

    try {

        const {
            name,
            code,
            discountType,
            discountValue,
            duration,
            durationInMonths,
            applicablePlan,
            maxRedemptions,
            expiryDate
        } = req.body;



        // VALIDATION
        if (
            !name ||
            !code ||
            !discountType ||
            !discountValue ||
            !duration
        ) {

            return res.status(400).json({

                success: false,
                message: "Required fields are missing"

            });
        }



        // CHECK EXISTING COUPON
        const existingCoupon = await Coupon.findOne({

            code: code.toUpperCase()

        });

        if (existingCoupon) {

            return res.status(400).json({

                success: false,
                message: "Coupon code already exists"

            });
        }



        // CREATE STRIPE COUPON
        const stripeCoupon = await stripe.coupons.create({

            name,

            duration,

            duration_in_months:
                duration === "repeating"
                    ? Number(durationInMonths)
                    : undefined,



            percent_off:
                discountType === "percentage"
                    ? Number(discountValue)
                    : undefined,



            amount_off:
                discountType === "fixed"
                    ? Number(discountValue) * 100
                    : undefined,



            currency:
                discountType === "fixed"
                    ? "usd"
                    : undefined,



            max_redemptions:
                maxRedemptions
                    ? Number(maxRedemptions)
                    : undefined,



            redeem_by:
                expiryDate
                    ? Math.floor(
                        new Date(expiryDate).getTime() / 1000
                    )
                    : undefined

        });




        // CREATE STRIPE PROMOTION CODE
        const promotionCode = await stripe.promotionCodes.create({

            promotion: {
                type: "coupon",
                coupon: stripeCoupon.id
            },

            code: code.toUpperCase(),

            max_redemptions:
                maxRedemptions
                    ? Number(maxRedemptions)
                    : undefined,

            expires_at:
                expiryDate
                    ? Math.floor(
                        new Date(expiryDate).getTime() / 1000
                    )
                    : undefined

        });




        // SAVE DATABASE
        const coupon = await Coupon.create({

            name,

            code: code.toUpperCase(),

            discountType,

            discountValue,

            duration,

            durationInMonths,

            applicablePlan,

            stripeCouponId: stripeCoupon.id,

            stripePromotionCodeId: promotionCode.id,

            maxRedemptions,

            expiryDate

        });




        return res.status(201).json({

            success: true,

            message: "Coupon created successfully",

            data: coupon

        });

    } catch (error) {

        console.log("CREATE COUPON ERROR =>", error);

        return res.status(500).json({

            success: false,

            message: error.message

        });
    }
};






// GET ALL COUPONS
const getCoupons = async (req, res) => {

    try {

        const coupons = await Coupon.find()
            .sort({ createdAt: -1 });

        return res.status(200).json({

            success: true,
            total: coupons.length,
            data: coupons

        });

    } catch (error) {

        return res.status(500).json({

            success: false,
            message: error.message

        });
    }
};






// GET SINGLE COUPON

const getCouponDetails = async (req, res) => {

    try {

        const { couponId } = req.params;

        const coupon = await Coupon.findById(couponId);

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: "Coupon not found"
            });
        }

        return res.status(200).json({

            success: true,
            data: coupon

        });

    } catch (error) {

        return res.status(500).json({

            success: false,
            message: error.message

        });
    }
};





// UPDATE COUPON
const updateCoupon = async (req, res) => {

    try {

        const { couponId } = req.params;

        const updatedCoupon = await Coupon.findByIdAndUpdate(

            couponId,

            req.body,

            {
                new: true
            }

        );

        if (!updatedCoupon) {
            return res.status(404).json({
                success: false,
                message: "Coupon not found"
            });
        }

        return res.status(200).json({

            success: true,
            message: "Coupon updated successfully",
            data: updatedCoupon

        });

    } catch (error) {

        return res.status(500).json({

            success: false,
            message: error.message

        });
    }
};





// DELETE COUPON
const deleteCoupon = async (req, res) => {

    try {

        const { couponId } = req.params;

        const coupon = await Coupon.findById(couponId);

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: "Coupon not found"
            });
        }


        // archive stripe coupon
        if (coupon.stripeCouponId) {

            await stripe.coupons.del(
                coupon.stripeCouponId
            );
        }


        await Coupon.findByIdAndDelete(couponId);


        return res.status(200).json({

            success: true,
            message: "Coupon deleted successfully"

        });

    } catch (error) {

        return res.status(500).json({

            success: false,
            message: error.message

        });
    }
};





module.exports = {

    createCoupon,
    getCoupons,
    getCouponDetails,
    updateCoupon,
    deleteCoupon

};