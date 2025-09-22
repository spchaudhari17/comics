const { upload_files, deleteFiles } = require("../../../helper/helper");
const Comic = require("../../models/Comic");
const Subject = require("../../models/Subject");
const sharp = require("sharp");
const mongoose = require('mongoose')

const createSubject = async (req, res) => {
  try {
    const { name } = req.body;
    const imageFile = req.files?.image;

    if (!name || !imageFile) {
      return res.status(400).json({ error: "Name and image are required" });
    }

    // Read buffer from uploaded file
    const buffer = Buffer.from(imageFile.data, "binary");

    // 🔹 Resize + compress before upload
    const optimizedBuffer = await sharp(buffer)
      .resize({ width: 600 })        // fix width, auto height
      .jpeg({ quality: 75 })         // compress to 75%
      .toBuffer();

    // Ab helper ke liye ek "fake file object" banao jisme optimized buffer ho
    const optimizedFile = {
      name: imageFile.name.replace(/\.[^/.]+$/, ".jpg"), // png -> jpg
      data: optimizedBuffer,
      mimetype: "image/jpeg"
    };

    // Upload image to S3
    const uploadedUrl = await upload_files("subjects", optimizedFile);
    if (!uploadedUrl) {
      return res.status(500).json({ error: "Image upload failed" });
    }

    // Save subject in DB
    const subject = await Subject.create({
      name,
      image: uploadedUrl,
    });

    res.json(subject);
  } catch (error) {
    console.error("Error adding subject:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};




// const getAllSubjects = async (req, res) => {
//   try {
//     const subjects = await Subject.aggregate([
//       // 1) link subjects -> concepts
//       {
//         $lookup: {
//           from: "concepts",
//           localField: "_id",
//           foreignField: "subjectId",
//           as: "concepts"
//         }
//       },

//       // 2) extract conceptIds
//       {
//         $addFields: {
//           conceptIds: {
//             $map: { input: "$concepts", as: "c", in: "$$c._id" }
//           }
//         }
//       },

//       // 3) lookup approved comics matching those conceptIds
//       {
//         $lookup: {
//           from: "comics",
//           let: { cids: "$conceptIds" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $and: [
//                     { $in: ["$conceptId", "$$cids"] },
//                     { $eq: ["$status", "approved"] }
//                   ]
//                 }
//               }
//             },
//             { $group: { _id: "$conceptId" } } // unique concepts only
//           ],
//           as: "approvedConcepts"
//         }
//       },

//       // 4) count approved concepts
//       {
//         $addFields: {
//           conceptCount: { $size: "$approvedConcepts" }
//         }
//       },

//       // 5) clean up
//       {
//         $project: {
//           concepts: 0,
//           conceptIds: 0,
//           approvedConcepts: 0
//         }
//       }
//     ]);

//     res.json(subjects);
//   } catch (err) {
//     console.error("Error fetching subjects with counts:", err);
//     res.status(500).json({ error: "Failed to fetch subjects" });
//   }
// };


const getAllSubjects = async (req, res) => {
  try {
    const { search } = req.query; // ?search=Math

    const pipeline = [];

    // 0) Search filter (agar search query hai to)
    if (search) {
      pipeline.push({
        $match: {
          name: { $regex: search, $options: "i" } // "name" field par search
        }
      });
    }

    pipeline.push(
      // 1) link subjects -> concepts
      {
        $lookup: {
          from: "concepts",
          localField: "_id",
          foreignField: "subjectId",
          as: "concepts"
        }
      },

      // 2) extract conceptIds
      {
        $addFields: {
          conceptIds: {
            $map: { input: "$concepts", as: "c", in: "$$c._id" }
          }
        }
      },

      // 3) lookup approved comics matching those conceptIds
      {
        $lookup: {
          from: "comics",
          let: { cids: "$conceptIds" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ["$conceptId", "$$cids"] },
                    { $eq: ["$status", "approved"] }
                  ]
                }
              }
            },
            { $group: { _id: "$conceptId" } } // unique concepts only
          ],
          as: "approvedConcepts"
        }
      },

      // 4) count approved concepts
      {
        $addFields: {
          conceptCount: { $size: "$approvedConcepts" }
        }
      },

      // 5) clean up
      {
        $project: {
          concepts: 0,
          conceptIds: 0,
          approvedConcepts: 0
        }
      }
    );

    const subjects = await Subject.aggregate(pipeline);

    res.json(subjects);
  } catch (err) {
    console.error("Error fetching subjects with counts:", err);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
};



const deleteSubject = async (req, res) => {
  try {
    const { id } = req.body;

    // Subject find karo
    const subject = await Subject.findById(id);
    if (!subject) {
      return res.status(404).json({ error: "Subject not found" });
    }

    // Agar image hai toh S3 se delete karo
    if (subject.image) {
      try {
        // S3 me se sirf fileName nikalna hoga (path ke last part)
        const imageUrl = subject.image;
        const fileName = imageUrl.split("/").pop(); // last part after '/'

        await deleteFiles("subjects", fileName);
      } catch (err) {
        console.warn("S3 delete failed:", err);
      }
    }

    // Subject ko DB se delete karo
    await Subject.findByIdAndDelete(id);

    res.json({ success: true, message: "Subject deleted successfully" });
  } catch (error) {
    console.error("Error deleting subject:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

 

const getConceptsBySubject = async (req, res) => {
  try {
    const subjectId = req.params.subjectId;

    // Subject validate
    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ error: "Subject not found" });
    }

    const result = await Comic.aggregate([
      {
        $match: {
          status: "approved",
          subjectId: new mongoose.Types.ObjectId(subjectId),
        },
      },

      {
        $group: {
          _id: "$conceptId",
          comicCount: { $sum: 1 },
        },
      },

      {
        $lookup: {
          from: "concepts",
          localField: "_id",
          foreignField: "_id",
          as: "conceptData",
        },
      },
      { $unwind: { path: "$conceptData", preserveNullAndEmptyArrays: true } },

      {
        $project: {
          _id: 0,
          conceptId: "$conceptData._id",
          name: "$conceptData.name",
          comicCount: 1,
        },
      },
    ]);

    res.json({
      subject: subject.name,
      concepts: result,
    });
  } catch (error) {
    console.error("Error fetching concepts:", error);
    res.status(500).json({ error: "Failed to fetch concepts" });
  }
};



const getComicsByConcept = async (req, res) => {
  try {
    const conceptId = req.params.conceptId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const comics = await Comic.aggregate([
      {
        $match: {
          status: "approved",
          conceptId: new mongoose.Types.ObjectId(conceptId),
        },
      },

      // latest pehle
      { $sort: { createdAt: -1 } },

      // pagination apply
      { $skip: skip },
      { $limit: limit },

      // FAQs join
      {
        $lookup: {
          from: "faqs",
          localField: "_id",
          foreignField: "comicId",
          as: "faqs",
        },
      },
      // Subjects join
      {
        $lookup: {
          from: "subjects",
          localField: "subjectId",
          foreignField: "_id",
          as: "subjectData",
        },
      },
      { $unwind: { path: "$subjectData", preserveNullAndEmptyArrays: true } },

      // DidYouKnow join
      {
        $lookup: {
          from: "didyouknows",
          localField: "_id",
          foreignField: "comicId",
          as: "facts",
        },
      },

      // Pages join for thumbnail
      {
        $lookup: {
          from: "comicpages",
          localField: "_id",
          foreignField: "comicId",
          as: "pages",
        },
      },

      // extra fields
      {
        $addFields: {
          hasFAQ: { $gt: [{ $size: "$faqs" }, 0] },
          hasDidYouKnow: { $gt: [{ $size: "$facts" }, 0] },
          thumbnail: { $arrayElemAt: ["$pages.imageUrl", 0] },
          subjectId: "$subjectData._id",
          subject: "$subjectData.name",
        },
      },

      // unnecessary arrays remove
      {
        $project: {
          faqs: 0,
          facts: 0,
          pages: 0,
          subjectData: 0,
          prompt: 0,
        },
      },
    ]);

    // total count for pagination
    const totalComics = await Comic.countDocuments({
      status: "approved",
      conceptId: new mongoose.Types.ObjectId(conceptId),
    });

    res.json({
      conceptId,
      page,
      limit,
      totalPages: Math.ceil(totalComics / limit),
      totalComics,
      comics,
    });
  } catch (error) {
    console.error("Error fetching comics by concept:", error);
    res.status(500).json({ error: "Failed to fetch comics" });
  }
};




module.exports = { createSubject, getAllSubjects, deleteSubject, getConceptsBySubject, getComicsByConcept };
